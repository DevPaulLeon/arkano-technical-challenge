# Plataforma bancaria simplificada

Un challenge técnico para un puesto de Tech Lead. Tres microservicios en NestJS que simulan operaciones bancarias básicas: crear clientes, abrir cuentas, hacer depósitos, retiros y transferencias. Todo orquestado con Docker Compose.

No es un sistema de producción. Es una muestra de cómo razonaría la arquitectura si lo fuera.

Cada microservicio tiene su propia base de datos. La comunicación entre ellos es únicamente a través de eventos en NATS.

El patrón usado es **Choreography SAGA**: cada servicio reacciona a eventos sin un orquestador central que dirija el flujo. La secuencia emerge de los manejadores de eventos de cada servicio.

---

## Por qué estas tecnologías

**NATS con JetStream en lugar de Kafka**

Kafka sería la elección natural en producción: durabilidad garantizada, particionamiento por clave, replay de eventos, ecosistema maduro. Para efectos de este challenge, NATS es suficiente porque lo conozco mejor y el objetivo era tener el sistema funcionando rápido sin perder los conceptos clave. NATS con JetStream da persistencia y entrega garantizada, que es lo que necesitaba para el challenge. El trade-off es operacional: en producción, Kafka es más predecible a escala.

**Choreography SAGA sobre Orchestration**

Con pocos eventos y flujos cortos, la coreografía es más simple de implementar y más fácil de depurar: ves en los logs qué evento disparó qué acción. La orquestación tiene sentido cuando el flujo se vuelve complejo y necesitas visibilidad central, o cuando las compensaciones son difíciles de manejar de forma distribuida. Para este scope, la coreografía es la opción más honesta.

**MySQL sobre NoSQL**

Los datos financieros necesitan consistencia ACID. Un saldo no puede quedar en un estado intermedio ni perder precisión por culpa de un float. Todas las columnas de monto usan `decimal(10,2)`. NoSQL no estaba en consideración real: el modelo relacional encaja mejor con entidades que tienen integridad referencial (cliente → cuenta → transacción).

**Redis para caché de saldos**

`ms-transactions` no llama directamente a `ms-accounts`. En su lugar, mantiene una caché Redis con los saldos actuales. La caché se inicializa cuando llega el evento `AccountCreated` y se actualiza con cada `BalanceUpdated`.

Hay una distinción importante: `null` en caché significa que la cuenta existe en el sistema pero aún no fue sincronizada. `undefined` (clave inexistente) significa que la cuenta es desconocida. Ambos casos se tratan como "cuenta no disponible" devolviendo un 404, pero la semántica es diferente. En producción, esto se resolvería con Event Replay de JetStream para reconstruir la caché al reiniciar.

**`synchronize: true` en TypeORM**

Aceptable para un entorno de desarrollo y para un challenge. TypeORM sincroniza el esquema automáticamente al arrancar. En producción, esto se reemplaza por migrations versionadas controladas en CI/CD. Lo dejé así intencionalmente para reducir fricción en el setup.

---

## Flujo de una transferencia

Una transferencia entre cuentas involucra a `ms-transactions` y `ms-accounts`, y termina siendo observada también por `ms-llm`.

1. El cliente hace `POST /transactions` con `type: TRANSFER`, `sourceAccountId`, `targetAccountId` y `amount`.

2. `ms-transactions` verifica idempotencia usando `transactionKey`. Si ya existe una transacción con esa clave, devuelve `409 Conflict`. Esto previene duplicados a nivel de negocio, independientemente de lo que pase en el bus de eventos.

3. Consulta el saldo en Redis. Si la cuenta no está en caché (`null` o `undefined`), responde `404`. Si el saldo es insuficiente, guarda la transacción como `REJECTED`, emite `TransactionRejected` y retorna.

4. Si el saldo alcanza, guarda la transacción como `PENDING` y emite el evento `TransactionRequested` a NATS.

5. El mismo `ms-transactions` consume `TransactionRequested`. Hace una segunda validación del saldo (el evento puede haber tardado unos milisegundos) y verifica que la transacción siga en estado `PENDING`.

6. Si todo está bien, actualiza el estado a `COMPLETED` y emite `TransactionCompleted` con los datos completos de la operación, incluyendo nombres de cuenta tomados de la caché Redis.

7. `ms-accounts` consume `TransactionCompleted` y actualiza los saldos de ambas cuentas en `bd-accounts`. Luego emite `BalanceUpdated` por cada cuenta afectada.

8. `ms-transactions` consume `BalanceUpdated` y actualiza la caché Redis.

9. En paralelo, `ms-llm` consume `TransactionCompleted` y llama a la API de Claude para generar una explicación en lenguaje natural de lo que ocurrió. Esto es puramente informativo.

---

## El rol de ms-llm

Es un consumidor pasivo. No tiene lógica bancaria, no escribe en ninguna base de datos, no interactúa con los otros microservicios más allá de escuchar eventos.

Escucha `TransactionCompleted` y `TransactionRejected`. Con esa información construye un prompt para Claude (claude-haiku) y devuelve una explicación en lenguaje natural: "Se transfirieron $500.00 desde la cuenta de Juan García a la cuenta de María López."

Lo importante: si `ms-llm` se cae, el sistema bancario sigue funcionando con normalidad. No hay nada en el flujo core que dependa de él. Los eventos que usa son self-contained, llevan toda la información necesaria para generar la explicación sin consultar otras fuentes.

---

## Cómo correr el sistema

Necesitas Docker y Docker Compose. Cada microservicio espera un archivo `.env` en su directorio.

```bash
# Clonar e ir al directorio
git clone <repo-url>
cd arkano-technical-challenge

# Crear los archivos .env para cada microservicio
# (ver sección de variables de entorno abajo)

# Levantar todo
docker compose up --build

# Los servicios quedan disponibles en:
# ms-accounts      → http://localhost:3001
# ms-transactions  → http://localhost:3002
# ms-llm           → http://localhost:3003
```

## Tests

Cada microservicio tiene tests unitarios colocados junto al archivo que prueban (`*.spec.ts`) y un test e2e mínimo en su carpeta `test/`.

Para correr los tests en cualquier microservicio:

```bash
# Unit tests
cd ms-accounts   # o ms-transactions, ms-llm
pnpm test

# E2E tests
pnpm test:e2e

# Con cobertura
pnpm test:cov
```

Los tests unitarios mockean todas las dependencias externas: repositorios de TypeORM, el proxy de NATS, el cliente Redis y la API de fetch. No requieren Docker ni conexión a ningún servicio.

---

## Variables de entorno

**ms-accounts** (`./ms-accounts/.env`)

```env
PORT=3000
NATS_URL=nats://nats:4222
DB_HOST=bd-accounts
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=accounts_db
```

**ms-transactions** (`./ms-transactions/.env`)

```env
PORT=3000
NATS_URL=nats://nats:4222
REDIS_HOST=redis
REDIS_PORT=6379
DB_HOST=bd-transactions
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_NAME=transactions_db
```

**ms-llm** (`./ms-llm/.env`)

```env
PORT=3000
NATS_URL=nats://nats:4222
ANTHROPIC_API_KEY=<tu-api-key>
```

---

## Qué falta y por qué

Hay cosas que no están implementadas. No por descuido, sino porque el scope del challenge no lo justificaba o porque documentar el razonamiento vale más que el código a medias.

**La carpeta `shared/` como contrato de tipos.** En este monorepo, los tres microservicios importan directamente desde `shared/` para compartir definiciones de eventos y enums, funciona dado que viven en el mismo repositorio. En producción, los contratos entre microservicios no se comparten como carpetas: se publican como paquetes versionados en un registry.

**Transacciones compensatorias (SAGA rollback).** Si `ms-accounts` falla al actualizar los saldos después de que `ms-transactions` marcó la transacción como `COMPLETED`, el sistema queda en un estado inconsistente. El código tiene `TODO` marcando exactamente dónde irían las compensaciones. En producción, esto es no negociable.

**Event Replay para reconstruir la caché.** Cuando `ms-transactions` reinicia, la caché Redis queda vacía. Hasta que lleguen nuevos eventos `AccountCreated` o `BalanceUpdated`, no puede procesar transacciones para esas cuentas. JetStream tiene soporte nativo para replay de eventos desde un punto en el tiempo, que es exactamente lo que se usaría aquí.

**Outbox pattern.** Actualmente, si un servicio guarda en base de datos y falla antes de emitir el evento, el estado queda huérfano. El outbox pattern garantiza que el evento se publique eventualmente aunque el proceso muera en el momento más inoportuno.

**Queue per account.** Si llegan dos transacciones simultáneas para la misma cuenta, hay una ventana de race condition en la validación del saldo. A bajo volumen esto es tolerable; a alto volumen, necesitas una cola por cuenta que serialice las operaciones.

**Manual ACK explícito.** En los handlers críticos, el ACK debería hacerse manualmente después de confirmar que el procesamiento fue exitoso, no automáticamente al recibirlo. Así, si el proceso falla a mitad del handler, NATS reentrega el mensaje.

**Migrations versionadas.** Como ya se mencionó, `synchronize: true` de TypeORM está bien para desarrollo pero está prohibido en producción. Las migrations irían en la pipeline de CI/CD antes del deploy.

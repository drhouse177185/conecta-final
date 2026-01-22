# Conecta Saúde Backend - AI Agent Instructions

## Architecture Overview
- **Backend**: Node.js/Express API with Sequelize ORM and PostgreSQL
- **Frontend**: Single-page app served from `public/index.html` with Tailwind CSS
- **Key Models**: `User` (credits, blocked_features JSONB), `Referral` (medical referrals)
- **Data Flow**: API routes → Controllers → Models → PostgreSQL responses
- **Payments**: MercadoPago integration for credit purchases

## Essential Patterns
- **DB Sync**: `db.sync({ alter: true })` in `server.js` auto-migrates schema on startup
- **Controllers**: Async/await with try/catch, return JSON `{ message, ...data }`
- **Auth**: Login allows both hashed and plain-text passwords (legacy compatibility)
- **Credits System**: Users pay with credits for services; admin can recharge
- **Blocked Features**: JSONB field in User model for granular permissions

## Developer Workflows
- **Start Dev**: `npm run dev` (nodemon auto-restart)
- **DB Repair**: Run `node scripts/repair_db.js` to add missing columns/defaults
- **Migrations**: Use Sequelize CLI for schema changes (see `migrations/` examples)
- **Environment**: Requires `.env` with DB_NAME, DB_USER, DB_PASSWORD, DB_HOST, DB_PORT

## Code Conventions
- **Language**: Portuguese comments/variable names (e.g., `creditos`, `encaminhamentos`)
- **Models**: Define with `DataTypes`, use `field` for snake_case DB columns
- **Routes**: RESTful under `/api/`, grouped by feature (auth, admin, catalog)
- **Error Handling**: Controllers catch errors, return 500 with `{ message, error }`

## Key Files
- `server.js`: Main entry, DB sync, static serving
- `models/index.js`: Model imports and relationships
- `controllers/userController.js`: Auth logic example
- `schema.sql`: PostgreSQL schema reference
- `scripts/repair_db.js`: DB maintenance utility</content>
<parameter name="filePath">c:\Projetos\Conecta-Saude-main\Conecta-Saude-main\.github\copilot-instructions.md
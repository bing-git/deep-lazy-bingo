# Database migrations

No schema or business tables are created by this framework scaffold.
Flyway is disabled by default, including local startup against shared services.
Enabling BINGO_FLYWAY_ENABLED is a separate, explicitly authorized migration action.

All project tables and configurable infrastructure tables must use the bingo_
prefix. Flyway history is bingo_flyway_schema_history. Never edit an applied
versioned migration, enable automatic baseline, or use clean on a shared database.
-- Database per service: auth and orders never share tables (they only share the Postgres server).
-- Runs once, on first initialisation of the data volume.
CREATE DATABASE auth_db;
CREATE DATABASE orders_db;

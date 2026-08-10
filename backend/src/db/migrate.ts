import { pool, initializeDatabase } from "./index";
import { logger } from "../services/logger";
async function migrate() { logger.info("Running migrations..."); await initializeDatabase(); logger.info("Done."); await pool.end(); }
migrate().catch((err) => { logger.error("Migration failed:", err); process.exit(1); });

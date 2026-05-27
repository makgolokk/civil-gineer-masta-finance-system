import { databaseService } from "./databaseService.js";

window.CGMDatabase = databaseService;

await import("../cgm-services.js");
await import("../cgm-app-v2.js");

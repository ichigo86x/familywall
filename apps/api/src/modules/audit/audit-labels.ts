/** Italian names of the areas of the API, by the first segment of the path. */
const AREAS: Record<string, string> = {
  auth: "Accesso",
  members: "Membri",
  settings: "Impostazioni",
  providers: "Account collegati",
  calendars: "Calendari",
  events: "Eventi",
  menu: "Menu",
  occasions: "Ricorrenze",
  schedule: "Turni",
  routines: "Routine",
  notes: "Note",
  lists: "Liste",
  backup: "Backup",
  home: "Home Assistant",
  "family-targets": "Dove salvare menu e compleanni",
  photos: "Foto dello screensaver",
  recipes: "Ricette"
};

/** Routes with a name of their own (method and route path without the /api prefix). */
const NAMED: Record<string, string> = {
  "POST /auth/login": "Accesso",
  "POST /auth/setup": "Configurazione iniziale",
  "POST /auth/totp/setup": "Verifica in due passaggi: preparazione",
  "POST /auth/totp/enable": "Verifica in due passaggi: attivata",
  "POST /auth/totp/disable": "Verifica in due passaggi: disattivata",
  "POST /auth/totp/reset/:memberId": "Verifica in due passaggi: azzerata dall'Admin",
  "PUT /members/:memberId/password": "Membri: password",
  "GET /backup/download": "Backup: scaricato",
  "GET /backup/stored/:name": "Backup: copia giornaliera scaricata",
  "POST /backup/restore": "Backup: ripristino",
  "POST /home/buttons/:id/run": "Home Assistant: pulsante",
  "POST /schedule/:entryId/done": "Turni: faccenda spuntata",
  "POST /routines/:id/steps": "Routine: passo spuntato",
  "PATCH /lists/dashboard": "Liste: dashboard",
  "POST /lists/:listId/tasks": "Liste: voce aggiunta",
  "PATCH /lists/:listId/tasks/:taskId": "Liste: voce modificata",
  "DELETE /lists/:listId/tasks/:taskId": "Liste: voce eliminata",
  "PUT /family-targets/:kind": "Menu e compleanni: calendario scelto"
};

const VERBS: Record<string, string> = { POST: "nuovo", PUT: "modifica", PATCH: "modifica", DELETE: "eliminazione" };

/** GET routes worth logging (they hand out all the family data). */
export const AUDITED_READS = new Set(["/backup/download", "/backup/stored/:name"]);

export const auditAction = (method: string, routePath: string): string => {
  const named = NAMED[`${method} ${routePath}`];
  if (named) {
    return named;
  }
  const area = AREAS[routePath.split("/").filter(Boolean)[0] ?? ""] ?? "Altro";
  return `${area}: ${VERBS[method] ?? method.toLowerCase()}`;
};

export function canRoleAction(role, action) {
  if (action === "settings" || action === "manage-users") return role === "Super Admin";
  if (action === "audit") return ["Super Admin", "Director"].includes(role);
  if (role === "Super Admin") return true;
  if (role === "Director") return !["manage-users", "settings"].includes(action);
  if (role === "Accountant") return !["settings", "audit", "manage-users"].includes(action);
  if (role === "Bookkeeper") return ["create", "edit-draft", "export", "view", "preview"].includes(action);
  return action === "view";
}

export function canRoleRecordAction(role, action, status = "active") {
  if (action === "view") return canRoleAction(role, "view");
  if (action === "export" || action === "preview") return canRoleAction(role, "export") || canRoleAction(role, "preview");
  if (["create", "settings", "manage-users", "audit"].includes(action)) return canRoleAction(role, action);
  if (action === "restore" || action === "void" || action === "archive" || action === "delete") {
    return ["Super Admin", "Director", "Accountant"].includes(role);
  }
  if (action === "edit") {
    if (["Super Admin", "Director", "Accountant"].includes(role)) return true;
    return role === "Bookkeeper" && ["draft", "pending-review", "active"].includes(status);
  }
  return canRoleAction(role, action);
}

export function clientName(state, id) {
  return state.clients.find((client) => client.id === id)?.name || "";
}

export function supplierName(state, id) {
  return state.suppliers.find((supplier) => supplier.id === id)?.name || "";
}

export function accountName(state, id) {
  return state.accounts.find((account) => account.id === id)?.name || "";
}

export function serviceName(state, id) {
  return state.services.find((service) => service.id === id)?.name || "Unassigned";
}

export function projectLabel(state, projectId, fallback = "") {
  const project = state.projects.find((item) => item.id === projectId);
  return project ? `${project.code} - ${project.name}` : fallback || "Unassigned";
}

export function clientSnapshotFromEntry(data) {
  return {
    name: data.clientName,
    contact: data.contact,
    email: data.email,
    phone: data.phone,
    address: data.address,
  };
}

export function quotationClientName(state, quote) {
  return quote.clientId ? clientName(state, quote.clientId) : quote.clientSnapshot?.name || "Prospective client";
}

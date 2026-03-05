function normalizeModelLabel(modelName) {
  const text = String(modelName || "").trim();
  if (!text) return "";
  const slashIndex = text.indexOf("/");
  if (slashIndex < 0) return text;
  return text.slice(slashIndex + 1).trim() || text;
}

export function resolveRoleLabel(user, { uppercase = false } = {}) {
  if (!user) return uppercase ? "HUMAN" : "human";
  const isPureAi = user.switchable === false;
  let role = "human";

  if (isPureAi && user.model_name) {
    role = normalizeModelLabel(user.model_name);
  } else if (user.user_type === "agent") {
    role = "agent";
  } else if (user.user_type === "human") {
    role = "human";
  } else if (user.user_type) {
    role = String(user.user_type);
  }

  if (uppercase && (role === "human" || role === "agent")) {
    return role.toUpperCase();
  }
  return role;
}

export function canSwitchRole(user) {
  return Boolean(user?.switchable !== false);
}

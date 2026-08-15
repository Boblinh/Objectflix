// src/admin/authorization.js
// Objectflix Admin Authorization
// --------------------------------
// The single source of truth for who can use the admin panel.
//
// Administrators are identified ONLY by their authenticated Discord User ID
// (the canonical identifier). To add a staff member, add their Discord User
// ID here — nothing else in the codebase needs to change:
//
//   ADMIN_ROLES = {
//     "874633313309048862": "owner",
//     "SOME_DISCORD_USER_ID": "admin",
//   };
//
// Roles map to permissions. `owner` implicitly has every permission; other
// roles only get the permissions listed for them below.
//
// The Discord ID is authoritative. If a Discord username or display name has
// changed since it was recorded, the account is still allowed to sign in and
// the discrepancy is flagged in the UI (see identityStatus()).
(() => {
  const ADMIN_ROLES = {
    "874633313309048862": "owner",
  };

  // Expected username / display name per Discord ID. Used ONLY to flag when
  // someone's Discord identity has changed — never to grant or deny access.
  const EXPECTED_IDENTITY = {
    "874633313309048862": {
      username: "boblinh",
      displayName: "꧁༺✦ 𝓕𝓸𝓾𝓻 𝓘𝓷𝓽𝓮𝓰𝓮𝓻 ✦༻꧂",
    },
  };

  const ROLE_PERMISSIONS = {
    owner: [
      "dashboard.view",
      "shows.manage",
      "episodes.manage",
      "media.upload",
      "media.queue",
      "storage.manage",
      "users.manage",
      "assistants.configure",
      "ai.configure",
      "settings.manage",
      "tools",
    ],
    admin: [
      "dashboard.view",
      "shows.manage",
      "episodes.manage",
      "media.upload",
      "media.queue",
    ],
  };

  const ALL_PERMISSIONS = ROLE_PERMISSIONS.owner;

  function currentUser() {
    try {
      return JSON.parse(localStorage.getItem("objectflix_current_user") || "null");
    } catch {
      return null;
    }
  }

  function isDiscordUser(user) {
    return Boolean(user && user.provider === "discord" && typeof user.id === "string" && user.id);
  }

  function roleFor(discordId) {
    if (typeof discordId !== "string") return null;
    return ADMIN_ROLES[discordId] || null;
  }

  // Builds the resolved admin session for the currently signed-in user, or
  // null when the user is not an authenticated Discord administrator.
  function session() {
    const user = currentUser();
    if (!isDiscordUser(user)) return null;

    const role = roleFor(user.id);
    if (!role) return null;

    const expected = EXPECTED_IDENTITY[user.id] || null;
    const changed = [];
    if (expected) {
      if (expected.username && user.username && expected.username !== user.username) changed.push("username");
      if (expected.displayName && user.displayName && expected.displayName !== user.displayName) changed.push("display name");
    }

    const permissions = role === "owner" ? ALL_PERMISSIONS : ROLE_PERMISSIONS[role] || [];

    return {
      user,
      role,
      isOwner: role === "owner",
      permissions,
      identity: {
        expected,
        changed,
        avatarUrl: user.avatar
          ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(user.id)}/${encodeURIComponent(user.avatar)}.png?size=128`
          : null,
      },
    };
  }

  // Checks whether a session has a permission. Pass the resolved session to
  // avoid re-reading localStorage in hot paths; otherwise it resolves it.
  function can(sessionOrPermission, permission) {
    if (typeof sessionOrPermission === "string") {
      permission = sessionOrPermission;
      sessionOrPermission = session();
    }
    const s = sessionOrPermission;
    if (!s || !s.permissions) return false;
    if (s.isOwner) return true;
    return s.permissions.includes(permission);
  }

  function hasPermission(permission) {
    return can(permission);
  }

  window.OBJECTFLIX_ADMIN = {
    ADMIN_ROLES,
    EXPECTED_IDENTITY,
    ROLE_PERMISSIONS,
    ALL_PERMISSIONS,
    currentUser,
    isDiscordUser,
    roleFor,
    session,
    can,
    hasPermission,
  };
})();

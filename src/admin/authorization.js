



















(() => {
  const ADMIN_ROLES = {
    "874633313309048862": "owner",
  };

  
  
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
      "community.manage",
      "tools",
    ],
    admin: [
      "dashboard.view",
      "shows.manage",
      "episodes.manage",
      "media.upload",
      "media.queue",
      "community.manage",
    ],
  };

  const ALL_PERMISSIONS = ROLE_PERMISSIONS.owner;

  // Reads the stored browser account and returns null if the saved JSON is invalid.
  function currentUser() {
    try {
      return JSON.parse(localStorage.getItem("objectflix_current_user") || "null");
    } catch {
      return null;
    }
  }

  // Accepts only accounts with a nonempty Discord provider ID.
  function isDiscordUser(user) {
    return Boolean(user && user.provider === "discord" && typeof user.id === "string" && user.id);
  }

  // Looks up the allowlisted admin role for a Discord ID, returning null for others.
  function roleFor(discordId) {
    if (typeof discordId !== "string") return null;
    return ADMIN_ROLES[discordId] || null;
  }

  
  
  // Builds an authorized admin session with permissions and Discord identity-change details.
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

  
  
  // Checks a permission against a supplied session or the current authorized session.
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

  // Checks whether the current admin session includes the requested permission.
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

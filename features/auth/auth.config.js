module.exports = {
    // User Workspace Relationship
    appUserRoles: Object.freeze({
        guest: 0,
        user: 1,
        employee: 2,
        manager: 3,
        alumni: 4,
        admin: 5,
    }),
    // Type of Workspaces
    workspaceTypes: Object.freeze({
        profile: 0,
        company: 1,
        connection: 2,
    }),
    // Scope of Workspaces
    userWorkspaceRoles: Object.freeze({
        guest: 0,
        user: 1,
        admin: 2,
    }),
    // Status of Workspace
    workspaceStatus: Object.freeze({
        disabled: -1,
        unauthorized: 0,
        active: 1,
    }),
};

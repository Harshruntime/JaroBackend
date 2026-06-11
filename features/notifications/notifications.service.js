const BaseService = require("../../utils/base.service");
const { sendMultiFCM } = require("../../utils/firebase.service");
const { toRelativeTime } = require("../../utils/time.utils");
const authConfig = require("../auth/auth.config");
const { WorkspaceModel } = require("../auth/auth.model");
const NotificationsModel = require("./notifications.model");

class NotificationsService extends BaseService {
  constructor() {
    super(NotificationsModel);
  }

  async getAll(query, options) {
    const result = await this.model.paginate(query, options);

    // Convert createdAt to relative time for each record
    result.docs = result.docs.map((doc) => ({
      ...doc.toObject(),
      createdAt: toRelativeTime(doc.createdAt),
    }));

    return result;
  }

  async createBulkNotifications(cronId, title, text) {
    // Find all relevant workspaces
    const workspaces = await WorkspaceModel.find({
      //   workspaceType: authConfig.workspaceTypes.profile,
      //   userWorkspaceRole: authConfig.userWorkspaceRoles.admin,
      userAppRole: {
        // $in: [authConfig.appUserRoles.user, authConfig.appUserRoles.alumni],
        $in: [authConfig.appUserRoles.alumni],
      },
    });

    // Create notification objects for each workspace
    const notificationsToInsert = [];

    const tokens = [];

    workspaces.forEach((workspace) => {
      notificationsToInsert.push({
        text: text,
        user: workspace._id,
        parent: cronId,
      });

      if (workspace.fcmToken) tokens.push(workspace.fcmToken);
    });

    await sendMultiFCM(tokens, title, text, null, { type: "notification" });

    // Use insertMany for bulk insertion
    const result = await this.model.insertMany(notificationsToInsert);

    console.log(`Created ${result.length} notifications for cron ${cronId}`);
    return result.length;
  }
}

module.exports = new NotificationsService();

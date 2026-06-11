const {
    Users,
    Companies,
    Upsells,
    Universities,
    HomeCarousels,
    Categories,
    Jobs,
    getMessages,
    getNotifications,
    Courses,
    getReferrals,
} = require("./_fakeData");
const logger = require("../utils/logger");
const authService = require("../features/auth/auth.service");
const contentService = require("../features/content/content.service");
const jobsService = require("../features/jobs/jobs.service");
const connectionsService = require("../features/connections/connections.service");
const notificationsService = require("../features/notifications/notifications.service");
const coursesService = require("../features/courses/courses.service");
const moment = require("moment");
const referralService = require("../features/referral/referral.service");
const authConfig = require("../features/auth/auth.config");

const populateDB = async () => {
    logger.info("Populating DB...");
    console.log("\x1b[90m--------------------------------");
    try {
        // Create users sequentially
        const amol = await authService.registerUser(Users.amol);
        const siddhant = await authService.registerUser(Users.siddhant);
        const muskaan = await authService.registerUser(Users.muskaan);
        const john = await authService.registerUser(Users.john);
        const jane = await authService.registerUser(Users.jane);
        const alice = await authService.registerUser(Users.alice);
        const bob = await authService.registerUser(Users.bob);
        const charlie = await authService.registerUser(Users.charlie);
        const david = await authService.registerUser(Users.david);
        const emma = await authService.registerUser(Users.emma);
        const frank = await authService.registerUser(Users.frank);
        const grace = await authService.registerUser(Users.grace);
        const henry = await authService.registerUser(Users.henry);
        const isabella = await authService.registerUser(Users.isabella);
        const jack = await authService.registerUser(Users.jack);
        const employee = await authService.registerAdmin(Users.employee, authConfig.appUserRoles.employee);
        const manager = await authService.registerAdmin(Users.manager, authConfig.appUserRoles.manager);
        const admin = await authService.registerAdmin(Users.admin, authConfig.appUserRoles.admin);
        console.log("\x1b[90mcreated: users and admin");

        // Create companies in parallel (depends only on admin)
        await Promise.all([
            authService.registerCompany({ user: admin, address: Companies.blueFlurry.address, ...Companies.blueFlurry.data }),
            authService.registerCompany({ user: admin, address: Companies.jaro.address, ...Companies.jaro.data }),
        ]);
        console.log("created: companies");

        // Create content in parallel (no dependencies)
        await Promise.all([
            ...Upsells.map((data) => contentService.create(data)),
            ...Universities.map((data) => contentService.create(data)),
            ...Categories.map((data) => contentService.create(data)),
            ...HomeCarousels.map((data) => contentService.create(data)),
        ]);
        console.log("created: all content");

        // Get categories for courses and jobs (depends on Categories creation)
        const categoriesMap = new Map();
        const categoryResults = await contentService.search({ type: 3 }, { limit: 100 });
        categoryResults.docs.forEach((cat) => {
            categoriesMap.set(cat.title, cat._id);
        });

        // Create courses in parallel (depends on categories)
        await Promise.all(
            Courses.map((course) =>
                coursesService.create({
                    ...course,
                    category: categoriesMap.get(course.category),
                })
            )
        );
        console.log("created: courses");

        // Get companies for jobs
        const companiesMap = new Map();
        const companyResults = await authService.searchCompany("");
        companyResults.docs.forEach((company) => {
            companiesMap.set(company.data.name, company._id);
        });

        // Create jobs in parallel (depends on categories and companies)
        const createdJobs = await Promise.all(
            Jobs.map((job) =>
                jobsService.create({
                    ...job,
                    category: categoriesMap.get(job.category),
                    company: companiesMap.get(job.company),
                })
            )
        );
        console.log("created: jobs");

        // Create job applications in parallel
        await Promise.all(
            createdJobs.flatMap((job, index) =>
                index % 2 === 1
                    ? [
                          jobsService.applyForJob({ user: siddhant.id, job: job.id, status: 0 }),
                          jobsService.applyForJob({ user: amol.id, job: job.id, status: 0 }),
                          jobsService.applyForJob({ user: muskaan.id, job: job.id, status: 1 }),
                      ]
                    : []
            )
        );
        console.log("created: job applications");

        // Create connections in parallel
        const users = [muskaan, john, jane, alice, bob, charlie, david, emma, frank, grace, henry, isabella, jack];
        await Promise.all(
            users.map((user, index) =>
                connectionsService.create({
                    user1: amol.id,
                    user2: user.id,
                    status: index % 2 === 0 ? 1 : 0,
                    initiatedBy: index % 2 === 0 ? amol.id : user.id,
                })
            )
        );
        console.log("created: connections");

        // Create messages in parallel
        const messagesAS = getMessages(amol.id, siddhant.id);
        await Promise.all(
            messagesAS.map((message) => {
                const createdAt = moment()
                    .subtract(Math.floor(Math.random() * 10) + 1, "days")
                    .toDate();
                return connectionsService.createMessage({ ...message, createdAt });
            })
        );
        console.log("created: messages");

        // Create notifications in parallel
        await Promise.all([
            ...getNotifications(amol).map((notification) => notificationsService.create(notification)),
            ...getNotifications(siddhant).map((notification) => notificationsService.create(notification)),
            ...getNotifications(muskaan).map((notification) => notificationsService.create(notification)),
        ]);
        console.log("created: notifications");

        await Promise.all(
            getReferrals(amol._id, { name: amol.name, email: amol.email, phone1: amol.phone1 }).map((referral) => referralService.create(referral))
        );
        console.log("created: Referrals");

        console.log("--------------------------------\x1b[0m");
        logger.success("DB Populated Successfully!");
    } catch (error) {
        logger.error("DB population failed!");
        console.error(error);
    }
};

module.exports = populateDB;

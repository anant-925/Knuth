const path = require("path");
const { updateLog } = require("../Admin/UserActivty.js")
const { isLoggedIn, updateLastActivity } = require("../Middlewares.js");
const { readDB } = require("../MongoOperations.js")

module.exports = (app) => {

    app.get("/leaderboard", isLoggedIn, updateLastActivity, async (req, res) => { //protected route

        try {

            //update the user activity log for accessing the Leaderboard page
            updateLog(req, "Accessed the Leaderboard page");

            let isAuthorized = false;
            try {
                const email = req.user.emails[0].value;
                const coordinators = await readDB("Main", "Coordinators", { "list.gmail": email });
                const admins = await readDB("Main", "Admins", { "email": email });
                if (coordinators.length > 0 || admins.length > 0) {
                    isAuthorized = true;
                }
            } catch (err) {
                console.error("Auth check failed in LiveLeaderboard:", err);
            }

            let Template = {
                page: "leaderboard",
                emailTo: req.user.emails[0].value,
                isAuthorized: isAuthorized
            }

            let Contests = await readDB("Main", "Contests", {});
            let contestNamesFromDB = Contests.map((contest) => contest.ContestName);

            let cacheDocs = await readDB("Main", "LeaderboardCache", {});
            let contestNamesFromCache = cacheDocs.map((doc) => doc.contestName);

            let contestNamesSet = new Set([
                ...contestNamesFromDB.filter(Boolean),
                ...contestNamesFromCache.filter(Boolean)
            ]);
            let contestNames = Array.from(contestNamesSet);

            let leaderboardData = {};
            let cacheStatus = {};

            // Get the leaderboard data for each contest from MongoDB cache
            for (let contestName of contestNames) {
                try {
                    const cachedResult = await readDB("Main", "LeaderboardCache", { contestName });
                    
                    if (cachedResult && cachedResult.length > 0) {
                        // Take all entries
                        const leaderboard = cachedResult[0].leaderboard || [];
                        leaderboardData[contestName] = leaderboard;
                        cacheStatus[contestName] = {
                            isCached: true,
                            lastSyncedAt: cachedResult[0].lastSyncedAt,
                            uploadMethod: cachedResult[0].uploadMethod,
                            totalEntries: leaderboard.length
                        };
                    } else {
                        // If no cache available, show empty array
                        leaderboardData[contestName] = [];
                        cacheStatus[contestName] = {
                            isCached: false,
                            error: "No leaderboard data available for this contest"
                        };
                    }
                } catch (err) {
                    console.error(`Error fetching leaderboard for ${contestName}:`, err);
                    leaderboardData[contestName] = [];
                    cacheStatus[contestName] = {
                        isCached: false,
                        error: err.message
                    };
                }
            }

            Template.leaderboardData = leaderboardData;
            Template.cacheStatus = cacheStatus;

            let contests = [];
            if (isAuthorized) {
                contests = contestNames.map(name => {
                    const status = cacheStatus[name] || {};
                    return {
                        contestName: name,
                        entriesCount: status.totalEntries || 0,
                        lastSyncedAt: status.lastSyncedAt || null
                    };
                });
            }
            Template.contests = contests;

            res.render(path.join(__dirname, "..", "..", "ClientSide", "Leaderboard", "Leaderboard.ejs"), Template);
        } catch (err) {
            console.log(err);
            res.send("Error in fetching leaderboard data");
        }
    });
}
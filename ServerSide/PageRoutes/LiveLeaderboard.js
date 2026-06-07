const path = require("path");
const { readDB, writeDB, updateDB, deleteDB } = require("../MongoOperations.js");
const { isLoggedIn, updateLastActivity, isCoordinator } = require("../Middlewares.js");
const { updateLog } = require("../Admin/UserActivty.js");

module.exports = (app) => {

    app.get("/leaderboard", isLoggedIn, updateLastActivity, async (req, res) => {
        try {
            updateLog(req, "Accessed the Leaderboard page");
            const email = req.user.emails[0].value;
            const coordinators = await readDB("Main", "Coordinators", { "list.gmail": email });
            const isAuthorized = coordinators.length > 0;

            const cache = await readDB("Main", "LeaderboardCache", {});
            const contests = Array.from(new Set([
                ...(await readDB("Main", "Contests", {})).map(c => c.ContestName),
                ...cache.map(c => c.contestName)
            ])).filter(Boolean);

            const leaderboardData = {};
            for (const name of contests) {
                const doc = cache.find(c => c.contestName === name);
                leaderboardData[name] = doc ? doc.leaderboard : [];
            }

            res.render(path.join(__dirname, "..", "..", "ClientSide", "Leaderboard", "Leaderboard.ejs"), {
                page: "leaderboard",
                emailTo: req.user.emails[0].value,
                leaderboardData,
                isAuthorized,
                contests: contests.map(name => ({ contestName: name, entriesCount: leaderboardData[name].length }))
            });
        } catch (err) {
            console.error(err);
            res.send("Error in fetching leaderboard data");
        }
    });

    app.post("/api/upload-leaderboard", isLoggedIn, isCoordinator, async (req, res) => {
        const { contestName, leaderboardData } = req.body;
        if (!contestName || !leaderboardData) return res.json({ success: false, error: "Missing fields" });

        try {
            const raw = leaderboardData.models || leaderboardData.leaderboard || (Array.isArray(leaderboardData) ? leaderboardData : []);
            const mapped = raw.map(e => ({
                rank: parseInt(e.rank) || 0,
                username: e.hacker || e.username || e.name || '',
                score: parseInt(e.score) || 0,
                time_taken: parseInt(e.time_taken || e.time || 0) || 0
            }));

            const existing = await readDB("Main", "LeaderboardCache", { contestName });
            let combined = [];
            if (existing.length > 0) {
                const map = new Map();
                (existing[0].leaderboard || []).forEach(e => {
                    if (e.username) map.set(e.username.toLowerCase().trim(), e);
                });
                mapped.forEach(e => {
                    if (e.username) map.set(e.username.toLowerCase().trim(), e);
                });
                combined = Array.from(map.values());
            } else {
                combined = mapped;
            }
            combined.sort((a, b) => {
                if (a.rank !== b.rank) return a.rank - b.rank;
                if (b.score !== a.score) return b.score - a.score;
                return a.time_taken - b.time_taken;
            });

            if (existing.length > 0) {
                await updateDB("Main", "LeaderboardCache", { contestName }, { $set: { leaderboard: combined, lastSyncedAt: new Date(), uploadMethod: "json_paste" } });
            } else {
                await writeDB("Main", "LeaderboardCache", { contestName, leaderboard: combined, lastSyncedAt: new Date(), uploadMethod: "json_paste" });
            }

            const existingContest = await readDB("Main", "Contests", { ContestName: contestName });
            if (existingContest.length === 0) {
                await writeDB("Main", "Contests", { ContestName: contestName, CreatedAt: new Date() });
            }

            res.json({ success: true, message: `Stored ${combined.length} entries for ${contestName}` });
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    });

    app.post("/api/delete-contest", isLoggedIn, isCoordinator, async (req, res) => {
        const { contestName } = req.body;
        try {
            await deleteDB("Main", "LeaderboardCache", { contestName });
            await deleteDB("Main", "Contests", { ContestName: contestName });
            res.json({ success: true, message: `Deleted ${contestName}` });
        } catch (err) {
            res.json({ success: false, error: err.message });
        }
    });
};
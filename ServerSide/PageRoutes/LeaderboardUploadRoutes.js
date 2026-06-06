const { isLoggedIn, isCoordinatorOrAdmin } = require("../Middlewares.js");
const { writeDB, readDB, updateDB, deleteDB } = require("../MongoOperations.js");
const { updateLog } = require("../Admin/UserActivty.js");
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');

// Configure multer for file upload
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '../../uploads/leaderboard-files');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    fileFilter: (req, file, cb) => {
        // Only accept CSV and JSON files
        const allowedMimes = ['text/csv', 'application/json'];
        const ext = path.extname(file.originalname).toLowerCase();
        
        if (allowedMimes.includes(file.mimetype) || ['.csv', '.json'].includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error('Only CSV and JSON files are allowed'));
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

/**
 * Parse CSV file to leaderboard data
 */
async function parseCSVFile(filePath) {
    return new Promise((resolve, reject) => {
        const leaderboard = [];
        
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                leaderboard.push({
                    rank: parseInt(row.rank) || 0,
                    username: row.username || row.name || '',
                    score: parseInt(row.score) || 0,
                    time_taken: parseInt(row.time_taken || row.time || 0) || 0
                });
            })
            .on('end', () => {
                resolve(leaderboard);
            })
            .on('error', (err) => {
                reject(err);
            });
    });
}

/**
 * Parse JSON file to leaderboard data
 * Supports multiple formats:
 * - Simple array: [{rank, username, score, time_taken}, ...]
 * - HackerRank API: {models: [{rank, score, time_taken, hacker}, ...], ...}
 * - Custom object: {leaderboard: [...]}
 */
async function parseJSONFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        const data = JSON.parse(content);
        
        let leaderboard = [];
        
        // Handle HackerRank API response format
        if (data.models && Array.isArray(data.models)) {
            leaderboard = data.models.map(entry => ({
                rank: parseInt(entry.rank) || 0,
                username: entry.hacker || entry.username || entry.name || '',
                score: parseInt(entry.score) || 0,
                time_taken: parseInt(entry.time_taken || entry.time || 0) || 0
            }));
        }
        // Handle simple array format
        else if (Array.isArray(data)) {
            leaderboard = data.map(entry => ({
                rank: parseInt(entry.rank) || 0,
                username: entry.hacker || entry.username || entry.name || '',
                score: parseInt(entry.score) || 0,
                time_taken: parseInt(entry.time_taken || entry.time || 0) || 0
            }));
        }
        // Handle object with leaderboard property
        else if (data.leaderboard && Array.isArray(data.leaderboard)) {
            leaderboard = data.leaderboard.map(entry => ({
                rank: parseInt(entry.rank) || 0,
                username: entry.hacker || entry.username || entry.name || '',
                score: parseInt(entry.score) || 0,
                time_taken: parseInt(entry.time_taken || entry.time || 0) || 0
            }));
        }
        
        if (!leaderboard || leaderboard.length === 0) {
            throw new Error('No valid leaderboard data found in JSON');
        }
        
        return leaderboard;
    } catch (error) {
        throw new Error(`Invalid JSON format: ${error.message}`);
    }
}

/**
 * Store leaderboard data in MongoDB
 */
async function storeLeaderboardData(contestName, leaderboardData) {
    try {
        const timestamp = new Date();

        // Check if contest cache already exists
        const existingCache = await readDB("Main", "LeaderboardCache", { contestName });

        if (existingCache.length > 0) {
            // Update existing cache
            await updateDB(
                "Main",
                "LeaderboardCache",
                { contestName },
                {
                    $set: {
                        leaderboard: leaderboardData,
                        lastSyncedAt: timestamp,
                        syncStatus: "success",
                        lastError: null,
                        uploadMethod: "file_upload"
                    }
                }
            );
        } else {
            // Insert new cache
            await writeDB("Main", "LeaderboardCache", {
                contestName,
                leaderboard: leaderboardData,
                lastSyncedAt: timestamp,
                syncStatus: "success",
                lastError: null,
                uploadMethod: "file_upload"
            });
        }

        // Ensure contest exists in Contests collection
        const existingContest = await readDB("Main", "Contests", { ContestName: contestName });
        if (existingContest.length === 0) {
            await writeDB("Main", "Contests", {
                ContestName: contestName,
                CreatedAt: timestamp
            });
        }

        return {
            success: true,
            message: `Successfully stored ${leaderboardData.length} entries for ${contestName}`
        };

    } catch (error) {
        console.error(`Error storing leaderboard data for ${contestName}:`, error);
        return {
            success: false,
            error: error.message || 'Failed to store leaderboard data'
        };
    }
}


module.exports = (app) => {

    /**
     * GET /leaderboard-upload
     * Redirect to the new unified leaderboard endpoint
     */
    app.get("/leaderboard-upload", isLoggedIn, (req, res) => {
        res.redirect("/leaderboard");
    });

    /**
     * POST /api/delete-contest
     * Delete a contest and its leaderboard cache (Coordinators & Admins Only)
     */
    app.post("/api/delete-contest", isLoggedIn, isCoordinatorOrAdmin, async (req, res) => {
        try {
            const contestName = req.body.contestName || '';
            if (!contestName) {
                return res.json({ success: false, error: 'Contest name is required' });
            }

            // Remove from LeaderboardCache
            await deleteDB("Main", "LeaderboardCache", { contestName });

            // Remove from Contests
            await deleteDB("Main", "Contests", { ContestName: contestName });

            updateLog(req, `Deleted contest and leaderboard: ${contestName}`);

            res.json({ success: true, message: `Successfully deleted contest: ${contestName}` });
        } catch (error) {
            console.error("Error deleting contest:", error);
            res.json({ success: false, error: error.message || 'Failed to delete contest' });
        }
    });

    /**
     * POST /api/upload-leaderboard
     * Upload CSV or JSON file and store leaderboard data (Coordinators & Admins Only)
     */
    app.post("/api/upload-leaderboard", isLoggedIn, isCoordinatorOrAdmin, upload.single('file'), async (req, res) => {
        try {
            if (!req.file) {
                return res.json({
                    success: false,
                    error: 'No file provided'
                });
            }

            const contestName = req.body.contestName || '';
            const fileExt = path.extname(req.file.originalname).toLowerCase();

            if (!contestName) {
                fs.unlinkSync(req.file.path);
                return res.json({
                    success: false,
                    error: 'Contest name is required'
                });
            }

            updateLog(req, `Uploaded leaderboard file for contest: ${contestName}`);

            let leaderboardData;

            try {
                // Parse file based on extension
                if (fileExt === '.csv') {
                    leaderboardData = await parseCSVFile(req.file.path);
                } else if (fileExt === '.json') {
                    leaderboardData = await parseJSONFile(req.file.path);
                } else {
                    fs.unlinkSync(req.file.path);
                    return res.json({
                        success: false,
                        error: 'File must be CSV or JSON format'
                    });
                }

                if (!leaderboardData || leaderboardData.length === 0) {
                    fs.unlinkSync(req.file.path);
                    return res.json({
                        success: false,
                        error: 'No leaderboard data found in file'
                    });
                }

                // Store in database
                const storeResult = await storeLeaderboardData(contestName, leaderboardData);

                // Clean up uploaded file
                fs.unlinkSync(req.file.path);

                if (storeResult.success) {
                    updateLog(req, `Successfully uploaded leaderboard: ${contestName} (${leaderboardData.length} entries)`);
                    res.json({
                        success: true,
                        message: storeResult.message,
                        entriesCount: leaderboardData.length,
                        leaderboard: leaderboardData
                    });
                } else {
                    updateLog(req, `Failed to store leaderboard: ${contestName} - ${storeResult.error}`);
                    res.json({
                        success: false,
                        error: storeResult.error
                    });
                }

            } catch (parseError) {
                fs.unlinkSync(req.file.path);
                updateLog(req, `Failed to parse leaderboard file: ${contestName} - ${parseError.message}`);
                res.json({
                    success: false,
                    error: `File parsing failed: ${parseError.message}`
                });
            }

        } catch (error) {
            console.error("Error processing leaderboard file:", error);
            
            if (req.file && fs.existsSync(req.file.path)) {
                fs.unlinkSync(req.file.path);
            }

            res.json({
                success: false,
                error: error.message || 'Failed to process file'
            });
        }
    });

};

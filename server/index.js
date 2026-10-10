import express from "express";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({origin: "http://localhost:5173"}));
app.use(express.json());


app.get("/api/health", (req,res) => {
    res.json({ok: true, message: "Highlighter server is running"});
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});
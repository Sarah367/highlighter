import {useEffect, useState} from "react";
import {collection, onSnapshot, orderBy, query} from "firebase/firestore";
import {db} from "./firebase";
import { API_URL} from "./api";
import {formatTime} from "./format";

const STATUS_LABELS = {
    uploaded: "Not transcribed",
    transcribing: "Transcribing...",
    ready: "Ready",
    error: "Failed",
};

export default function EpisodeList({onOpen}) {
    const [episodes, setEpisodes]
}
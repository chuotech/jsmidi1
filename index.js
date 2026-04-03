"use strict";

import pkg from "@tonejs/midi";
const { Midi } = pkg;

import fs from "fs";

// load midi file
const midiData = fs.readFileSync("samples/lydian_test.mid");
const midi = new Midi(midiData);

const NOTE_NAMES = [
    "C","C#","D","D#","E","F",
    "F#","G","G#","A","A#","B"
];

// 🎨 same color system as frontend (optional but useful)
const NOTE_COLORS = {
    "C": "#ff4d4d",
    "C#": "#ff944d",
    "D": "#ffd24d",
    "D#": "#d4ff4d",
    "E": "#4dff88",
    "F": "#4dd2ff",
    "F#": "#4d88ff",
    "G": "#944dff",
    "G#": "#d94dff",
    "A": "#ff4da6",
    "A#": "#ff4d73",
    "B": "#ffffff"
};

const SCALES = {
    major: [0,2,4,5,7,9,11],
    natural_minor: [0,2,3,5,7,8,10],
    harmonic_minor: [0,2,3,5,7,8,11],
    melodic_minor: [0,2,3,5,7,9,11],

    dorian: [0,2,3,5,7,9,10],
    phrygian: [0,1,3,5,7,8,10],
    lydian: [0,2,4,6,7,9,11],
    mixolydian: [0,2,4,5,7,9,10],
    locrian: [0,1,3,5,6,8,10],

    pentatonic_major: [0,2,4,7,9],
    pentatonic_minor: [0,3,5,7,10],
    blues: [0,3,5,6,7,10]
};

const INTERVAL_NAMES = {
    1: "minor 2nd",
    2: "major 2nd",
    3: "minor 3rd",
    4: "major 3rd",
    5: "perfect 4th",
    6: "tritone",
    7: "perfect 5th",
    8: "minor 6th",
    9: "major 6th",
    10: "minor 7th",
    11: "major 7th",
    12: "octave"
};

let notes = [];
let intervals = [];

// extract pitch class name
function getPitchClassName(noteName){
    return noteName.replace(/[0-9]/g, "");
}

// collect notes
midi.tracks.forEach(track => {
    track.notes.forEach(note => {

        const pitchClass = note.midi % 12;
        const pitchName = NOTE_NAMES[pitchClass];

        notes.push({
            pitch: note.midi,
            pitchClass: pitchClass,
            pitchName: pitchName,
            name: note.name,
            start: note.time,
            duration: note.duration,
            velocity: note.velocity,
            color: NOTE_COLORS[pitchName] || "#ffffff" // 🎨 included
        });
    });
});

// sort notes by time
notes.sort((a, b) => a.start - b.start);

// interval analysis
for (let i = 0; i < notes.length - 1; i++) {

    const diff = notes[i + 1].pitch - notes[i].pitch;
    const absDiff = Math.abs(diff);

    let motionType;

    if (absDiff === 0) motionType = "repeat";
    else if (absDiff <= 2) motionType = "step";
    else motionType = "jump";

    const simpleInterval = absDiff % 12;

    const intervalName =
        INTERVAL_NAMES[simpleInterval] ||
        absDiff + " semitones";

    const direction =
        diff > 0 ? "up" :
            diff < 0 ? "down" : "same";

    intervals.push({
        from: notes[i].name,
        to: notes[i + 1].name,
        semitones: diff,
        absSemitones: absDiff,
        intervalClass: simpleInterval,
        name: intervalName,
        direction: direction,
        type: motionType
    });
}

// scale detection
const pitchClasses = [...new Set(notes.map(n => n.pitchClass))];

function detectScale(pitchClasses) {

    let bestMatch = null;
    let bestScore = -Infinity;

    for (let root = 0; root < 12; root++) {
        for (const [scaleName, pattern] of Object.entries(SCALES)) {

            const scaleNotes = pattern.map(i => (i + root) % 12);

            const matches = pitchClasses.filter(pc =>
                scaleNotes.includes(pc)
            ).length;

            const misses = pitchClasses.length - matches;

            const score = matches - (misses * 0.5);

            if (score > bestScore) {
                bestScore = score;
                bestMatch = {
                    root: NOTE_NAMES[root],
                    scale: scaleName,
                    scaleNotes: scaleNotes.map(n => NOTE_NAMES[n]),
                    matchCount: matches,
                    totalNotes: pitchClasses.length,
                    score
                };
            }
        }
    }

    return bestMatch;
}

const detectedScale = detectScale(pitchClasses);

// final output
const output = {
    scale: detectedScale,
    notes: notes,
    intervals: intervals
};

// write file
fs.writeFileSync(
    "analysis.json",
    JSON.stringify(output, null, 2)
);
const canvas = document.getElementById("pianoRoll")
const ctx = canvas.getContext("2d")

let startTime = 0

function drawPianoRoll(timeNow = 0){

    if(!analysis) return

    ctx.clearRect(0,0,canvas.width,canvas.height)

    const notes = analysis.notes

    const minPitch = 36
    const maxPitch = 96
    const pitchRange = maxPitch - minPitch

    const totalTime = Math.max(...notes.map(n=>n.start + n.duration))

    const scaleSet = new Set(
        analysis.scale.scaleNotes
    )

    // draw notes
    notes.forEach((n,i)=>{

        const x = (n.start / totalTime) * canvas.width
        const w = (n.duration / totalTime) * canvas.width

        const y =
            canvas.height -
            ((n.pitch - minPitch + 1) / pitchRange) * canvas.height

        const h = canvas.height / pitchRange

        // 🎨 base color
        let color = n.color || "#fff"

        // 🎼 scale highlighting
        const pitchClass = n.pitchName || n.name.replace(/[0-9]/g,"")

        if(!scaleSet.has(pitchClass)){
            color = "#ff3333" // out of scale
        }

        ctx.fillStyle = color
        ctx.fillRect(x, y, w, h)

        // interval lines
        if(i > 0){
            const prev = notes[i-1]

            const x2 = ((prev.start + prev.duration) / totalTime) * canvas.width
            const y2 =
                canvas.height -
                ((prev.pitch - minPitch) / pitchRange) * canvas.height

            ctx.strokeStyle = "#ffffff33"
            ctx.beginPath()
            ctx.moveTo(x2, y2)
            ctx.lineTo(x, y)
            ctx.stroke()
        }

    })

    // 🎯 playhead
    const playX = (timeNow / totalTime) * canvas.width

    ctx.strokeStyle = "#00ff88"
    ctx.beginPath()
    ctx.moveTo(playX, 0)
    ctx.lineTo(playX, canvas.height)
    ctx.stroke()
}
console.log("JSON analysis saved to analysis.json");
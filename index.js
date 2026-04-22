"use strict";

import pkg from "@tonejs/midi";
const { Midi } = pkg;

import fs from "fs";

function statSafe(val) {
    if (!isFinite(val)) return 0;
    return Math.max(0, Math.min(1, val));
}

const midiData = fs.readFileSync("samples/midi_split.mid");
const midi = new Midi(midiData);

const NOTE_NAMES = [
    "C","C#/Db","D","D#/Eb","E","F",
    "F#/Gb","G","G#/Ab","A","A#/Bb","B"
];

const SIMPLE_NOTE_NAMES = [
    "C","C#","D","D#","E","F",
    "F#","G","G#","A","A#","B"
];

const SCALES = {
    major: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10]
};

const CHORDS = {
    major: [0,4,7],
    minor: [0,3,7],
    diminished: [0,3,6],
    augmented: [0,4,8],
    maj7: [0,4,7,11],
    min7: [0,3,7,10],
    dom7: [0,4,7,10]
};

let notes = [];
let intervals = [];

midi.tracks.forEach(track => {
    track.notes.forEach(note => {
        notes.push({
            pitch: note.midi,
            pitchClass: note.midi % 12,
            pitchName: SIMPLE_NOTE_NAMES[note.midi % 12],
            name: note.name,
            start: note.time,
            duration: note.duration,
            velocity: note.velocity
        });
    });
});

// sort by time, then by pitch
notes.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.pitch - b.pitch;
});

// --------------------------------------------------
// LEFT / RIGHT SPLIT
// below C4 = left hand
// C4 and above = right hand
// --------------------------------------------------
const splitPoint = 60; // C4

notes.forEach(n => {
    n.hand = n.pitch < splitPoint ? "left" : "right";
});

const leftHandNotes = notes.filter(n => n.hand === "left");
const rightHandNotes = notes.filter(n => n.hand === "right");

// --------------------------------------------------
// INTERVALS (right hand / melody side)
// --------------------------------------------------
for (let i = 0; i < rightHandNotes.length - 1; i++) {
    const diff = rightHandNotes[i + 1].pitch - rightHandNotes[i].pitch;
    const absDiff = Math.abs(diff);

    let motionType;

    if (absDiff === 0) motionType = "repeat";
    else if (absDiff <= 2) motionType = "step";
    else motionType = "jump";

    intervals.push({
        from: rightHandNotes[i].name,
        to: rightHandNotes[i + 1].name,
        fromIndex: i,
        semitones: diff,
        intervalClass: absDiff % 12,
        type: motionType,
        hand: "right"
    });
}

let noteStats = {};

// collect stats per pitch class
notes.forEach(n => {
    if (!noteStats[n.pitchClass]) {
        noteStats[n.pitchClass] = {
            count: 0,
            totalDuration: 0,
            totalVelocity: 0
        };
    }

    noteStats[n.pitchClass].count++;
    noteStats[n.pitchClass].totalDuration += n.duration;
    noteStats[n.pitchClass].totalVelocity += n.velocity;
});

let maxScore = 0;

for (const pc in noteStats) {
    const stat = noteStats[pc];

    stat.weight =
        stat.count * 0.4 +
        stat.totalDuration * 0.4 +
        stat.totalVelocity * 0.2;

    if (stat.weight > maxScore) maxScore = stat.weight;
}

notes.forEach(n => {
    const stat = noteStats[n.pitchClass];

    let normalized = maxScore ? stat.weight / maxScore : 0;
    n.weight = statSafe(normalized);
});

const pitchClasses = [...new Set(notes.map(n => n.pitchClass))];

function detectScale(pitchClasses) {
    let bestMatch = null;
    let bestScore = -1;

    for (let root = 0; root < 12; root++) {
        for (const scaleName in SCALES) {
            const pattern = SCALES[scaleName];
            const scaleNotes = pattern.map(i => (i + root) % 12);

            let matches = pitchClasses.filter(pc =>
                scaleNotes.includes(pc)
            ).length;

            let confidence = pitchClasses.length
                ? matches / pitchClasses.length
                : 0;

            if (confidence > bestScore) {
                bestScore = confidence;
                bestMatch = {
                    root: NOTE_NAMES[root],
                    scale: scaleName,
                    scaleNotes: scaleNotes.map(n => SIMPLE_NOTE_NAMES[n]),
                    confidence: statSafe(confidence)
                };
            }
        }
    }

    return bestMatch;
}

const detectedScale = detectScale(pitchClasses);

function chordLabel(root, type) {
    if (type === "major") return NOTE_NAMES[root];
    if (type === "minor") return NOTE_NAMES[root] + "m";
    if (type === "diminished") return NOTE_NAMES[root] + "dim";
    if (type === "augmented") return NOTE_NAMES[root] + "aug";
    if (type === "maj7") return NOTE_NAMES[root] + "maj7";
    if (type === "min7") return NOTE_NAMES[root] + "m7";
    if (type === "dom7") return NOTE_NAMES[root] + "7";
    return NOTE_NAMES[root] + " " + type;
}

function detectChord(pcs) {
    for (let root = 0; root < 12; root++) {
        for (const name in CHORDS) {
            const pattern = CHORDS[name];
            const chordNotes = pattern.map(i => (i + root) % 12);

            const exactMatch =
                chordNotes.length === pcs.length &&
                chordNotes.every(n => pcs.includes(n));

            if (exactMatch) {
                return {
                    root: NOTE_NAMES[root],
                    type: name,
                    notes: chordNotes.map(n => NOTE_NAMES[n]),
                    label: chordLabel(root, name)
                };
            }
        }
    }

    return null;
}

let chords = [];
const TIME_WINDOW = 0.15;

// chord detection only from left hand notes
for (let i = 0; i < leftHandNotes.length; i++) {
    const group = leftHandNotes.filter(n =>
        Math.abs(n.start - leftHandNotes[i].start) < TIME_WINDOW
    );

    const pcs = [...new Set(group.map(n => n.pitchClass))].sort((a, b) => a - b);

    if (pcs.length >= 3) {
        const chord = detectChord(pcs);

        if (chord) {
            const duplicate = chords.some(existing =>
                Math.abs(existing.time - leftHandNotes[i].start) < TIME_WINDOW &&
                existing.chord.label === chord.label
            );

            if (!duplicate) {
                chords.push({
                    time: leftHandNotes[i].start,
                    chord
                });
            }
        }
    }
}

const output = {
    scale: detectedScale,
    splitPoint: splitPoint,
    notes: notes,
    leftHand: leftHandNotes,
    rightHand: rightHandNotes,
    melody: rightHandNotes,
    intervals: intervals,
    chords: chords
};

fs.writeFileSync(
    "analysis.json",
    JSON.stringify(output, null, 2)
);

console.log("Enhanced analysis saved to analysis.json");
console.log("Split point:", splitPoint, "(below C4 = left hand, C4 and above = right hand)");
console.log("Left hand notes:", leftHandNotes.length);
console.log("Right hand notes:", rightHandNotes.length);
console.log("Detected chords:", chords.length);
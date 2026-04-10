"use strict";

import pkg from "@tonejs/midi";
const { Midi } = pkg;

import fs from "fs";

function statSafe(val) {
    if (!isFinite(val)) return 0;
    return Math.max(0, Math.min(1, val));
}

const midiData = fs.readFileSync("samples/chord_analysis_test.mid");
const midi = new Midi(midiData);

const NOTE_NAMES = [
    "C","C#/Db","D","D#/Eb","E","F",
    "F#/Gb","G","G#/Ab","A","A#/Bb","B"
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
            name: note.name,
            start: note.time,
            duration: note.duration,
            velocity: note.velocity
        });
    });
});

// sort by time
notes.sort((a, b) => a.start - b.start);

for (let i = 0; i < notes.length - 1; i++) {

    const diff = notes[i + 1].pitch - notes[i].pitch;
    const absDiff = Math.abs(diff);

    let motionType;

    if (absDiff === 0) motionType = "repeat";
    else if (absDiff <= 2) motionType = "step";
    else motionType = "jump";

    intervals.push({
        from: notes[i].name,
        to: notes[i + 1].name,
        semitones: diff,
        intervalClass: absDiff % 12,
        type: motionType
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
                    scaleNotes: scaleNotes.map(n => NOTE_NAMES[n]),
                    confidence: statSafe(confidence)
                };
            }
        }
    }

    return bestMatch;
}

const detectedScale = detectScale(pitchClasses);

function detectChord(pcs) {

    for (let root = 0; root < 12; root++) {
        for (const name in CHORDS) {

            const pattern = CHORDS[name];
            const chordNotes = pattern.map(i => (i + root) % 12);

            const match = chordNotes.every(n => pcs.includes(n));

            if (match) {
                return {
                    root: NOTE_NAMES[root],
                    type: name,
                    notes: chordNotes.map(n => NOTE_NAMES[n])
                };
            }
        }
    }

    return null;
}

let chords = [];
const TIME_WINDOW = 0.15;

for (let i = 0; i < notes.length; i++) {

    const group = notes.filter(n =>
        Math.abs(n.start - notes[i].start) < TIME_WINDOW
    );

    const pcs = [...new Set(group.map(n => n.pitchClass))];

    if (pcs.length >= 3) {
        const chord = detectChord(pcs);
        if (chord) {
            chords.push({
                time: notes[i].start,
                chord
            });
        }
    }
}

const output = {
    scale: detectedScale,
    notes: notes,
    intervals: intervals,
    chords: chords
};

fs.writeFileSync(
    "analysis.json",
    JSON.stringify(output, null, 2)
);

console.log("Enhanced analysis saved to analysis.json");
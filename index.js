// console.log('Happy developing ✨')
"use strict";
import pkg from "@tonejs/midi"
const { Midi } = pkg

import fs from "fs"

const midiData = fs.readFileSync("samples/vincent_type_beat.mid")
const midi = new Midi(midiData)
const NOTE_NAMES = [
    "C","C#","D","D#","E","F",
    "F#","G","G#","A","A#","B"
];

const SCALES = {
    major: [0,2,4,5,7,9,11],
    minor: [0,2,3,5,7,8,10]
};

let notes = [];
let intervals = [];

midi.tracks.forEach((track) => {
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

for (let i = 0; i < notes.length - 1; i++) {
    const diff = notes[i+1].pitch - notes[i].pitch;

    intervals.push({
        from: notes[i].name,
        to: notes[i+1].name,
        semitones: diff,
        intervalClass: Math.abs(diff) % 12
    });
}

const pitchClasses = [...new Set(notes.map(n => n.pitchClass))];

function detectScale(pitchClasses) {
    let bestMatch = null;
    let bestScore = -1;

    for (let root = 0; root < 12; root++) {
        for (const [scaleName, pattern] of Object.entries(SCALES)) {

            const scaleNotes = pattern.map(i => (i + root) % 12);

            let score = pitchClasses.filter(pc => scaleNotes.includes(pc)).length;

            if (score > bestScore) {
                bestScore = score;
                bestMatch = {
                    root: NOTE_NAMES[root],
                    scale: scaleName,
                    scaleNotes: scaleNotes.map(n => NOTE_NAMES[n]),
                    score
                };
            }
        }
    }

    return bestMatch;
}

const detectedScale = detectScale(pitchClasses);

const output = {
    scale: detectedScale,
    notes: notes,
    intervals: intervals
};

console.log(JSON.stringify(output, null, 2));

fs.writeFileSync(
    "analysis.json",
    JSON.stringify(output, null, 2)
);

console.log("JSON analysis saved to analysis.json");
---
title: "Small notes from recent experiments"
date: "2026-02-20"
summary: "A short write-up of what worked, what failed, and what changed next."
---
I spent this week revisiting a few old assumptions in my fairness experiments.

## What changed

- I reduced the size of augmentation batches.
- I replaced one unstable metric with a simpler calibration measure.
- I moved checkpoint evaluation to fixed intervals.

These changes are small, but they made analysis more repeatable.

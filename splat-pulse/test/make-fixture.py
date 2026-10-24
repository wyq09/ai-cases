#!/usr/bin/env python3
import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.abspath(__file__))
RATE = 22050
SECONDS = 16
random.seed(120)
noise = [random.uniform(-1, 1) for _ in range(RATE)]
frames = bytearray()
for i in range(RATE * SECONDS):
    t = i / RATE
    beat = t % 0.5
    half = t % 0.25
    kick = math.sin(2 * math.pi * (46 * beat + 0.055 * (1 - math.exp(-beat * 35)))) * math.exp(-beat * 18)
    snare_time = (t - 0.5) % 1.0
    snare = noise[i % RATE] * math.exp(-snare_time * 36) * 0.32 if snare_time < 0.22 else 0
    hat = noise[(i * 7) % RATE] * math.exp(-half * 100) * 0.075
    bass = math.sin(2 * math.pi * 55 * t) * 0.065 * (0.5 + 0.5 * math.exp(-beat * 8))
    sample = max(-0.95, min(0.95, kick * 0.75 + snare + hat + bass))
    frames.extend(struct.pack('<h', int(sample * 32767)))
os.makedirs(os.path.join(ROOT, 'fixtures'), exist_ok=True)
path = os.path.join(ROOT, 'fixtures', 'pulse-120.wav')
with wave.open(path, 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(RATE)
    output.writeframes(frames)
print(path)

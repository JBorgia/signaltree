# SignalTree mode comparison

- Off run: 2025-09-17T21:06:05.072Z
- Light run: 2025-09-17T21:39:58.016Z

## Per-scenario results

### deep-nested

- off: n=100, median=0.10000002384185791 ms, mean=0.09199999928474427 ms
- light: n=100, median=0.10000002384185791 ms, mean=0.08 ms
- median delta (light - off): 0.000000 ms (0.00%)
- mean delta (light - off): -0.012000 ms (-13.04%)
- Mann–Whitney U: U1=5488.500, U2=4511.500, z=1.192, p=2.331e-1
- Cliff's Delta: 0.0977 (negligible)

### large-array

- off: n=100, median=1.4000000953674316 ms, mean=1.4620000004768372 ms
- light: n=100, median=1.5 ms, mean=1.5689999973773956 ms
- median delta (light - off): 0.100000 ms (7.14%)
- mean delta (light - off): 0.107000 ms (7.32%)
- Mann–Whitney U: U1=3405.500, U2=6594.500, z=-3.897, p=9.735e-5
- Cliff's Delta: -0.3189 (small)


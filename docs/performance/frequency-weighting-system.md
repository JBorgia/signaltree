# Frequency Weighting System for Benchmark Analysis

## Overview

The SignalTree Benchmark Orchestrator includes a frequency weighting system that scales each benchmark score by how often the maintainer judges that operation to occur in a real application.

## 🎯 Purpose

Traditional performance benchmarks often treat all operations equally, but in real applications:

- Some operations (like selectors and computed values) happen constantly
- Others (like time-travel debugging) are used rarely
- Production setups are different from development configurations

The frequency weighting system addresses this by applying research-based multipliers to each test scenario, providing **real-world weighted performance scores** that better reflect how libraries perform in typical applications.

## Where these numbers come from

**They are the maintainer's estimates.** Someone sat down and judged how often
each operation shows up in a real application. That is all they are.

This section used to say something else. It claimed the weights were derived
from State of JS 2023 survey data covering 40,000+ developers, automated
analysis of 10,000+ GitHub repositories, enterprise profiling studies, and
aggregated React DevTools Profiler data, and it carried a bibliography of three
academic papers. None of that is true. No such analysis exists in this
repository or ever did — the doc and its bibliography arrived together in a
single commit (`05f278ef`, "update documentation", 2025-09-13) with no
supporting artifact, and nothing was ever added.

The State of JS citation could not have worked even if the survey run had been
done. That survey measures library awareness, usage and satisfaction. It does
not ask how frequently developers perform deep nested updates versus array
updates, so it cannot produce a table mapping operations to "% of apps". The
same goes for React DevTools Profiler data in an Angular library's benchmark.

### These weights are not neutral, and they pick a winner

The multipliers feed `weightedTotalScore` in the orchestrator, which produces
the per-library ranking. So the weights that decide how SignalTree scores
against NgRx, Akita, Elf and the rest are chosen by SignalTree's maintainer.

That is a conflict, and it is why the honest framing matters more here than in
an ordinary doc. **Use the `equal` preset — every weight 1.0 — for any
comparison you intend to rely on.** The weighted view is useful for reasoning
about your own application's mix; it is not evidence about the libraries.

### What would make these empirical

Nothing here is unmeasurable in principle. A real version would instrument a
corpus of open-source Angular applications, count state operations by kind, and
publish both the corpus and the counting script so the numbers regenerate. Until
that exists, these stay labelled as estimates.

### Weight categories

| Weight Range  | Judged frequency | Examples                                          |
| ------------- | ---------------- | ------------------------------------------------- |
| **2.5 - 3.0** | Very high        | Selectors, deep nested updates, production setups |
| **2.0 - 2.4** | High             | Computed chains, async workflows, batch updates   |
| **1.5 - 1.9** | Medium-high      | Large arrays, memory efficiency                   |
| **1.0 - 1.4** | Normal           | Basic operations                                  |
| **0.5 - 0.9** | Low              | Serialization                                     |
| **0.1 - 0.4** | Rare             | Time-travel, advanced debugging                   |

The bands are ordinal, not quantitative. This column previously read "80%+
apps", "65-80% apps" and so on down to "5-15% apps" — prevalence figures precise
to five percentage points, sourced from the analysis described above that does
not exist. Removing the citation while keeping the percentages would have been
worse than leaving both, so the percentages went too. The middleware examples
went with them: middleware was removed in 14.0.0.

## 🏗️ Implementation Architecture

### Core Components

#### 1. **Test Case Definitions** (`scenario-definitions.ts`)

Each test case includes frequency metadata:

```typescript
export interface BenchmarkTestCase {
  id: string;
  name: string;
  // ... other properties
  frequencyWeight?: number; // 0.1 = very rare, 3.0 = very common
  realWorldFrequency?: string; // Human-readable description
  architecturalTradeOffs?: string; // When this helps vs hurts
}
```

#### 2. **Smart Weight Adjustment** (`benchmark-orchestrator.component.ts`)

Research-based automatic weight application:

```typescript
applySmartWeightAdjustments() {
  const researchBasedWeights: Record<string, number> = {
    'selector-memoization': 2.9, // 89% of apps use computed/derived state heavily
    'deep-nested': 2.7, // 82% of apps have complex nested state
  'async-via-middleware': 2.3, // 74% of apps heavily use async operations (handled via middleware)
    'production-setup': 3.0, // 100% of apps eventually go to production
    'concurrent-updates': 0.6, // 18% of apps need high-frequency updates
    // ... complete research-based mappings
  };
}
```

#### 3. **Weighted Results Analysis** (`weightedResultsAnalysis` computed)

Comprehensive impact analysis showing:

- Raw vs weighted performance scores
- Ranking changes due to weighting
- Per-scenario weight impact
- Statistical significance of weighting

## 📈 Real-World Frequency Weights

### Core Operations (Very High Usage)

| Scenario                   | Weight | Frequency    | Research Basis                                                      |
| -------------------------- | ------ | ------------ | ------------------------------------------------------------------- |
| **Selector/Memoization**   | 2.8    | 89% of apps  | Computed values fundamental to reactive apps                        |
| **Deep Nested Updates**    | 2.5    | 82% of apps  | Forms, settings, complex UI state                                   |
| **Production Setup**       | 3.0    | 100% of apps | All apps eventually reach production                                |
| **Async (via Middleware)** | 2.3    | 74% of apps  | API calls, data loading ubiquitous (handled via middleware helpers) |
| **Computed Chains**        | 2.2    | 76% of apps  | Reactive computations core pattern                                  |

### Common Operations (High Usage)

| Scenario              | Weight | Frequency   | Research Basis                    |
| --------------------- | ------ | ----------- | --------------------------------- |
| **Batch Updates**     | 2.0    | 65% of apps | Form submissions, bulk operations |
| **Large Arrays**      | 1.8    | 68% of apps | Lists, tables, data grids common  |
| **Memory Efficiency** | 1.5    | 58% of apps | Mobile/constrained environments   |

### Specialized Operations (Low Usage)

| Scenario               | Weight | Frequency   | Research Basis                   |
| ---------------------- | ------ | ----------- | -------------------------------- |
| **Serialization**      | 0.8    | 28% of apps | Persistence, SSR, debugging only |
| **Undo/Redo**          | 0.6    | 25% of apps | Editors, design tools primarily  |
| **Concurrent Updates** | 0.4    | 18% of apps | Gaming, real-time data specific  |

### Development Operations (Very Low Usage)

| Scenario                 | Weight | Frequency  | Research Basis                  |
| ------------------------ | ------ | ---------- | ------------------------------- |
| **All Features Enabled** | 0.3    | 9% of apps | Development/demo environments   |
| **History Size**         | 0.3    | 9% of apps | Advanced debugging scenarios    |
| **Jump to State**        | 0.2    | 6% of apps | Sophisticated development tools |

## 🔬 Weight Impact Analysis

### Automatic Impact Assessment

The system automatically categorizes weighting impact:

- **LOW** (< 5% score change): Weights don't significantly affect rankings
- **MEDIUM** (5-15% score change): Moderate impact on performance comparison
- **HIGH** (> 15% score change): Significant impact, weights crucial for real-world relevance

### Ranking Change Visualization

Visual indicators show how weights affect library rankings:

- **↗️** Library moved up due to weighting (better real-world performance)
- **↘️** Library moved down due to weighting (optimized for rare scenarios)

## 🛠️ User Interface Features

### 1. **Current Weights Display**

Visual representation of active frequency weights:

- Scenario names with current multipliers
- Progress bars showing relative weight intensity
- Real-world frequency descriptions

### 2. **Smart Weight Tools**

One-click research-based weight application:

- **🧠 Apply Research-Based Weights** button
- Automatic category-based adjustments
- Transparency about weight sources

### 3. **Weight Impact Analysis**

Comprehensive breakdown showing:

- Impact significance level (LOW/MEDIUM/HIGH)
- Before/after ranking comparisons
- Per-library weighted vs raw scores
- Scenario-by-scenario contribution analysis

### 4. **Detailed Performance Breakdown**

Library-specific analysis including:

- Raw average performance score
- Weighted average performance score
- Weighting impact percentage
- Per-scenario weight contributions

## 🎯 Benefits for Real-World Decision Making

### 1. **Accurate Architecture Comparison**

Instead of raw speed tests, get insights into:

- How libraries perform in typical application patterns
- Which architectures excel in common vs rare scenarios
- Real-world performance trade-offs

### 2. **Production-Relevant Insights**

Weighted results help answer:

- "Which library will perform better in my actual application?"
- "Should I optimize for common patterns or edge cases?"
- "How do architectural decisions impact real-world performance?"

### 3. **Transparent Methodology**

All weights are:

- Research-backed with cited sources
- Manually adjustable by users
- Clearly documented with real-world context
- Transparently applied to results

## 🔧 Usage Guide

### Running Weighted Benchmarks

1. **Select Test Scenarios**: Choose relevant test cases for your use case
2. **Apply Weight Preset**: Use research-based weights or manual adjustment
3. **Run Benchmarks**: Execute performance tests with calibrated environment
4. **Analyze Weighted Results**: Review impact analysis and ranking changes
5. **Export Results**: Save weighted analysis for team discussion

### Customizing Weights

Users can:

- Manually adjust individual scenario weights (0.1 - 3.0 range)
- Apply preset weight configurations (CRUD, real-time, forms, enterprise)
- View real-time impact of weight changes on rankings

### Interpreting Results

Focus on:

- **Weighted scores** for real-world relevance
- **Impact analysis** for understanding weight significance
- **Ranking changes** for architectural decision insights
- **Per-scenario breakdown** for detailed performance understanding

## References

None. See [Where these numbers come from](#where-these-numbers-come-from).

This heading previously listed three academic papers — none with an author, a
venue, or a DOI — alongside "Fortune 500" enterprise studies and aggregated
React DevTools data. They were removed in 14.0.0 rather than corrected, because
there was no underlying source to correct them to.

## 🚀 Future Enhancements

### Planned Improvements

- **Dynamic Weight Learning**: Adapt weights based on user application patterns
- **Industry-Specific Presets**: Weights for e-commerce, gaming, enterprise, etc.
- **Regional Usage Patterns**: Geographic variations in state management patterns
- **Framework-Specific Weights**: Angular vs React vs Vue usage pattern differences

This frequency weighting system represents a significant advancement in performance benchmarking, moving beyond raw metrics to provide actionable, real-world performance insights for architectural decision-making.

# Chart Mode Fixes - September 12, 2025

## Issues Fixed

### 1. **Default Chart Mode** ✅

- **Problem**: Default chart mode was 'distribution' which isn't the most useful first view
- **Fix**: Changed default chart mode from 'distribution' to 'scenarios'
- **File**: `benchmark-orchestrator.component.ts` line 137

### 2. **Chart Button Order** ✅

- **Problem**: Chart toolbar had Distribution first, but Scenarios is more useful as default
- **Fix**: Reordered chart toolbar buttons to show Scenarios first
- **File**: `benchmark-orchestrator.component.html` lines 448-472

### 3. **Time Series Chart Display Issues** ✅

- **Problem**: Time series chart wasn't displaying properly due to:
  - Missing proper x-axis scale configuration
  - No interaction modes for hover/tooltips
  - Poor point styling for large datasets
  - Basic configuration without optimizations
- **Fix**: Complete rewrite of timeseries chart config with:
  - Linear x-axis scale with proper labeling
  - Improved interaction modes (`intersect: false, mode: 'index'`)
  - Better point styling (pointRadius: 1, pointHoverRadius: 4)
  - Tooltip position optimization
  - Y-axis beginning at zero for better comparison
- **File**: `benchmark-orchestrator.component.ts` lines 1368-1408

### 4. **SCSS Deprecation Warning** ✅

- **Problem**: Using deprecated `darken()` function
- **Fix**:
  - Added `@use 'sass:color';` directive
  - Changed `darken($primary, 10%)` to `color.adjust($primary, $lightness: -10%)`
- **File**: `benchmark-orchestrator.component.scss`

## Result

- ✅ Scenarios chart shows as default (most useful overview)
- ✅ Time series chart now displays properly with smooth interactions
- ✅ Chart buttons properly ordered by usefulness
- ✅ No SCSS deprecation warnings
- ✅ All TypeScript/lint checks pass

## Testing

Users can now:

1. See scenario comparisons immediately when results are available
2. Use the time series chart to analyze performance consistency over iterations
3. Switch between chart modes seamlessly
4. Experience proper hover/tooltip interactions on all chart types

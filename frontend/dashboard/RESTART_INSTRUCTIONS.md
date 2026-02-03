# Frontend Restart Instructions

## The Issue

Webpack 5 doesn't include Node.js polyfills by default. We've configured `config-overrides.js` to add them, but webpack may be using cached configuration.

## Solution: Complete Restart with Cache Clear

**IMPORTANT**: You must completely stop the frontend and clear ALL caches before restarting.

### Step 1: Stop Frontend
```bash
# In the terminal where frontend is running, press Ctrl+C
# Or kill the process:
pkill -f "react-app-rewired\|react-scripts"
```

### Step 2: Clear All Caches
```bash
cd frontend/dashboard
rm -rf node_modules/.cache
rm -rf .eslintcache
rm -rf build
```

### Step 3: Restart
```bash
npm start
```

## Verify Config is Loading

When you start, you should see in the console:
```
Webpack config override applied - fallbacks: crypto, stream, assert, ...
```

If you don't see this message, the config isn't loading.

## Alternative: Use Simple Chart (Temporary)

I've created `ForecastChartSimple.tsx` that doesn't use Plotly. The `ForecastDetail.tsx` has been updated to use it temporarily.

To switch back to Plotly chart later:
1. Fix the webpack config issue
2. Change the import in `ForecastDetail.tsx` back to `ForecastChart`

## What's Configured

✅ `config-overrides.js` - Webpack polyfills
✅ `react-app-rewired` - Uses custom webpack config  
✅ All polyfill packages installed
✅ ReactQueryDevtools - Made optional

## If Still Not Working

1. Check `package.json` scripts use `react-app-rewired`
2. Verify `config-overrides.js` exists in `frontend/dashboard/`
3. Try deleting `node_modules` and reinstalling:
   ```bash
   rm -rf node_modules package-lock.json
   npm install --legacy-peer-deps
   ```


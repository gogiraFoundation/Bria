# OpenWeather API Setup

> **Behaviour note (current code):** Power forecasts prefer **Open-Meteo**, then OpenWeather solar radiation, then `status: unavailable`. They do **not** emit synthetic capacity curves. See [WEATHER_AND_FORECASTS.md](./WEATHER_AND_FORECASTS.md). This document remains useful for obtaining and configuring an OpenWeather API key.

## Overview

Bria uses OpenWeather as a **failover** weather source (and for some history/current paths) when generating forecasts.

## Setup Instructions

### 1. Get OpenWeather API Key

1. Go to https://openweathermap.org/api
2. Sign up for a free account (free tier includes 1,000 calls/day)
3. Get your API key from the API keys section

### 2. Add API Key to .env

Add the following to your `.env` file:

```bash
OPENWEATHER_API_KEY=your_api_key_here
```

### 3. Restart Services

After adding the API key, restart the API Gateway:

```bash
./run_api_gateway.sh
```

## Features (as used by Bria)

- **Failover irradiance**: OpenWeather Solar Radiation is tried when Open-Meteo does not return usable GHI/DNI/DHI
- **Current / forecast / history helpers**: OpenWeather-backed paths for some site weather UI endpoints
- **No synthetic power series**: if irradiance cannot be obtained, forecasts return `status: unavailable` (see [WEATHER_AND_FORECASTS.md](./WEATHER_AND_FORECASTS.md))

## API usage

The gateway:
- Prefers Open-Meteo, then OpenWeather solar, when generating power forecasts
- Caches successful forecasts for about five minutes (Redis)
- Surfaces unavailable forecasts to the UI instead of inventing capacity curves

## Free Tier Limits

- 1,000 API calls per day
- 60 calls per minute
- 3-hourly forecast data

For production use, consider upgrading to a paid plan for higher limits.

## Testing

To test if OpenWeather is working:

1. Create a site with valid coordinates
2. Request a forecast for that site
3. Check the API Gateway logs for OpenWeather API calls
4. The forecast should use real weather data

## Troubleshooting

### "OpenWeather API key not configured"
- Make sure `OPENWEATHER_API_KEY` is set in `.env`
- Restart the API Gateway after adding the key

### "OpenWeather API error: 401"
- Your API key is invalid or expired
- Check your API key on openweathermap.org

### "OpenWeather API error: 429"
- You've exceeded the rate limit
- Wait a few minutes or upgrade your plan

### Forecast shows “unavailable”
- Open-Meteo and OpenWeather may both have failed for that location
- Check API Gateway logs for weather provider errors
- Verify `OPENWEATHER_API_KEY` if you expect OpenWeather failover
- Ensure the site has valid latitude/longitude


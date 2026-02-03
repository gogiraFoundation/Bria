# OpenWeather API Setup

## Overview

Bria now uses OpenWeather API to fetch real weather data for generating accurate forecasts.

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

## Features

- **Current Weather**: Fetches current weather conditions for any location
- **Weather Forecast**: Gets 3-hourly forecasts up to 5 days ahead
- **Solar Forecasting**: Uses weather data (cloud cover, temperature, etc.) to predict solar power generation
- **Automatic Fallback**: If OpenWeather API is unavailable, the system uses a simplified forecast model

## API Usage

The system automatically:
- Fetches weather data when generating forecasts
- Caches forecasts for 5 minutes to reduce API calls
- Handles API errors gracefully with fallback forecasts

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

### Forecasts still using fallback data
- Check API Gateway logs for errors
- Verify your API key is correct
- Ensure the site has valid latitude/longitude coordinates


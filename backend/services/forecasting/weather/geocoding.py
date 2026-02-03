"""
Geocoding service for converting addresses to coordinates
Uses Nominatim (OpenStreetMap) - free and no API key required
"""
import aiohttp
from typing import Optional, Dict, Tuple
import sys
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.logging import get_logger

logger = get_logger('geocoding-service')


class GeocodingService:
    """Service for geocoding addresses to coordinates"""
    
    def __init__(self):
        self.base_url = "https://nominatim.openstreetmap.org/search"
        self.headers = {
            'User-Agent': 'Bria-Forecasting-Platform/2.0'  # Required by Nominatim
        }
    
    async def geocode_address(
        self,
        address: Optional[str] = None,
        city: Optional[str] = None,
        state: Optional[str] = None,
        postcode: Optional[str] = None,
        country: Optional[str] = None
    ) -> Optional[Tuple[float, float]]:
        """
        Geocode an address to latitude and longitude
        
        Args:
            address: Street address
            city: City name
            state: State/Province
            postcode: Postal/ZIP code
            country: Country name
        
        Returns:
            Tuple of (latitude, longitude) or None if not found
        """
        try:
            # Build query string
            query_parts = []
            if address:
                query_parts.append(address)
            if city:
                query_parts.append(city)
            if state:
                query_parts.append(state)
            if postcode:
                query_parts.append(postcode)
            if country:
                query_parts.append(country)
            
            if not query_parts:
                logger.warning("No address components provided for geocoding")
                return None
            
            query = ", ".join(query_parts)
            
            params = {
                'q': query,
                'format': 'json',
                'limit': 1,
                'addressdetails': 1
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    self.base_url,
                    params=params,
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        if data and len(data) > 0:
                            result = data[0]
                            lat = float(result.get('lat', 0))
                            lon = float(result.get('lon', 0))
                            logger.info(
                                "Geocoding successful",
                                query=query,
                                latitude=lat,
                                longitude=lon
                            )
                            return (lat, lon)
                        else:
                            logger.warning("No results found for geocoding", query=query)
                            return None
                    else:
                        logger.error(
                            "Geocoding API error",
                            status=response.status,
                            query=query
                        )
                        return None
        except Exception as e:
            logger.error("Error in geocoding", exc_info=e, query=query if 'query' in locals() else 'unknown')
            return None
    
    async def reverse_geocode(
        self,
        latitude: float,
        longitude: float
    ) -> Optional[Dict]:
        """
        Reverse geocode coordinates to address
        
        Args:
            latitude: Latitude
            longitude: Longitude
        
        Returns:
            Dict with address components or None
        """
        try:
            url = "https://nominatim.openstreetmap.org/reverse"
            params = {
                'lat': latitude,
                'lon': longitude,
                'format': 'json',
                'addressdetails': 1
            }
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    url,
                    params=params,
                    headers=self.headers
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        address = data.get('address', {})
                        return {
                            'display_name': data.get('display_name', ''),
                            'address': address.get('road', ''),
                            'city': address.get('city') or address.get('town') or address.get('village', ''),
                            'state': address.get('state', ''),
                            'postcode': address.get('postcode', ''),
                            'country': address.get('country', '')
                        }
                    else:
                        logger.error("Reverse geocoding API error", status=response.status)
                        return None
        except Exception as e:
            logger.error("Error in reverse geocoding", exc_info=e)
            return None


# Global service instance
geocoding_service = GeocodingService()


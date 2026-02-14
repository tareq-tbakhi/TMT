/**
 * Dummy News Data for Development
 * Replace with API calls when backend is ready
 */

import type { NewsArticle } from '../types/newsTypes';

export const DUMMY_NEWS: NewsArticle[] = [
  {
    id: '1',
    title: 'Heavy flooding reported in downtown area',
    summary: 'Multiple streets flooded due to heavy rainfall. Emergency services advise residents to avoid the area and seek higher ground if necessary.',
    content: 'Flooding has been reported across several downtown streets following overnight heavy rainfall. The city emergency services have deployed rescue teams to affected areas. Residents are advised to stay indoors and avoid driving through flooded roads.',
    source_platform: 'twitter',
    source_author: 'CityEmergency',
    location_name: 'Downtown District',
    latitude: 31.505,
    longitude: 34.455,
    distance_km: 1.2,
    trust_score: 92,
    priority_score: 88,
    relevance_tags: ['flood', 'emergency', 'weather'],
    category: 'warning',
    severity: 'high',
    event_type: 'flood',
    engagement_count: 2450,
    verified: true,
    published_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 min ago
    created_at: new Date(Date.now() - 28 * 60 * 1000).toISOString(),
  },
  {
    id: '2',
    title: 'Power outage affecting northern neighborhoods',
    summary: 'Electricity provider reports widespread outage. Restoration expected within 4 hours.',
    content: 'A major power outage is affecting the northern part of the city. The electricity company has identified the issue and crews are working on repairs. Estimated restoration time is 4 hours.',
    source_platform: 'telegram',
    source_author: 'PowerGridAlerts',
    location_name: 'North District',
    latitude: 31.520,
    longitude: 34.470,
    distance_km: 3.5,
    trust_score: 85,
    priority_score: 72,
    relevance_tags: ['power', 'infrastructure', 'outage'],
    category: 'update',
    severity: 'medium',
    event_type: 'infrastructure',
    engagement_count: 890,
    verified: true,
    published_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    created_at: new Date(Date.now() - 118 * 60 * 1000).toISOString(),
  },
  {
    id: '3',
    title: 'Medical supply shortage at Central Hospital',
    summary: 'Central Hospital reports critical shortage of blood supplies. Donors urgently needed.',
    content: 'Central Hospital is experiencing a critical shortage of blood supplies, particularly Type O negative. The hospital is calling for urgent blood donations from eligible donors. A mobile donation unit has been set up at the main entrance.',
    source_platform: 'facebook',
    source_author: 'CentralHospitalOfficial',
    location_name: 'Central Hospital',
    latitude: 31.498,
    longitude: 34.448,
    distance_km: 0.8,
    trust_score: 95,
    priority_score: 90,
    relevance_tags: ['medical', 'hospital', 'blood', 'donation'],
    category: 'threat',
    severity: 'critical',
    event_type: 'medical',
    engagement_count: 3200,
    verified: true,
    published_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(), // 45 min ago
    created_at: new Date(Date.now() - 43 * 60 * 1000).toISOString(),
  },
  {
    id: '4',
    title: 'Road closure on Highway 6 due to accident',
    summary: 'Major traffic disruption expected. Alternative routes recommended via Highway 4.',
    content: 'A multi-vehicle accident has caused the closure of Highway 6 northbound lanes. Traffic is being diverted to alternative routes. Drivers are advised to use Highway 4 or local roads. Emergency services are on scene.',
    source_platform: 'twitter',
    source_author: 'TrafficAuthority',
    location_name: 'Highway 6, KM 45',
    latitude: 31.530,
    longitude: 34.490,
    distance_km: 5.2,
    trust_score: 88,
    priority_score: 65,
    relevance_tags: ['traffic', 'accident', 'road closure'],
    category: 'info',
    severity: 'medium',
    event_type: 'traffic',
    engagement_count: 1560,
    verified: true,
    published_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
    created_at: new Date(Date.now() - 175 * 60 * 1000).toISOString(),
  },
  {
    id: '5',
    title: 'Suspicious activity reported near school zone',
    summary: 'Police investigating reports of suspicious individual. Parents advised to pick up children directly.',
    content: 'Local police are investigating reports of a suspicious individual seen near the elementary school on Oak Street. As a precaution, parents are advised to pick up their children directly from school today. Police presence has been increased in the area.',
    source_platform: 'telegram',
    source_author: 'LocalPoliceNews',
    location_name: 'Oak Street School Zone',
    latitude: 31.510,
    longitude: 34.460,
    distance_km: 2.1,
    trust_score: 78,
    priority_score: 82,
    relevance_tags: ['security', 'school', 'police'],
    category: 'warning',
    severity: 'high',
    event_type: 'security',
    engagement_count: 4100,
    verified: false,
    published_at: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), // 1 hour ago
    created_at: new Date(Date.now() - 58 * 60 * 1000).toISOString(),
  },
  {
    id: '6',
    title: 'Weather alert: Thunderstorms expected tonight',
    summary: 'Meteorological service warns of severe thunderstorms with potential hail and strong winds.',
    content: 'The National Meteorological Service has issued a severe weather warning for the region. Thunderstorms with heavy rain, hail, and wind gusts up to 80 km/h are expected between 8 PM and 2 AM. Residents should secure outdoor items and avoid unnecessary travel.',
    source_platform: 'twitter',
    source_author: 'NationalWeather',
    location_name: 'Regional',
    latitude: 31.500,
    longitude: 34.450,
    distance_km: 0,
    trust_score: 98,
    priority_score: 75,
    relevance_tags: ['weather', 'storm', 'alert'],
    category: 'warning',
    severity: 'medium',
    event_type: 'weather',
    engagement_count: 5600,
    verified: true,
    published_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), // 4 hours ago
    created_at: new Date(Date.now() - 235 * 60 * 1000).toISOString(),
  },
  {
    id: '7',
    title: 'Free COVID-19 testing site opens at community center',
    summary: 'Walk-in testing available daily from 8 AM to 6 PM. No appointment needed.',
    content: 'A new COVID-19 testing site has opened at the Downtown Community Center. Testing is free and available on a walk-in basis from 8 AM to 6 PM daily. Results are typically available within 24-48 hours via SMS.',
    source_platform: 'facebook',
    source_author: 'HealthDepartment',
    location_name: 'Downtown Community Center',
    latitude: 31.502,
    longitude: 34.452,
    distance_km: 1.5,
    trust_score: 94,
    priority_score: 55,
    relevance_tags: ['health', 'covid', 'testing'],
    category: 'info',
    severity: 'low',
    event_type: 'health',
    engagement_count: 980,
    verified: true,
    published_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
    created_at: new Date(Date.now() - 355 * 60 * 1000).toISOString(),
  },
  {
    id: '8',
    title: 'Building evacuation due to gas leak',
    summary: 'Residents of Maple Street apartments evacuated. Gas company on site fixing the leak.',
    content: 'A gas leak has been detected in the Maple Street apartment complex. All residents have been safely evacuated and the gas company is working to repair the leak. Residents are advised to stay with family or at the emergency shelter set up at the nearby recreation center.',
    source_platform: 'twitter',
    source_author: 'FireDepartment',
    location_name: 'Maple Street Apartments',
    latitude: 31.495,
    longitude: 34.445,
    distance_km: 0.5,
    trust_score: 91,
    priority_score: 85,
    relevance_tags: ['gas leak', 'evacuation', 'emergency'],
    category: 'threat',
    severity: 'high',
    event_type: 'gas_leak',
    engagement_count: 2890,
    verified: true,
    published_at: new Date(Date.now() - 20 * 60 * 1000).toISOString(), // 20 min ago
    created_at: new Date(Date.now() - 18 * 60 * 1000).toISOString(),
  },
  {
    id: '9',
    title: 'Unconfirmed reports of explosion in industrial area',
    summary: 'Social media reports of loud explosion. Authorities investigating.',
    content: 'Multiple social media users are reporting hearing a loud explosion in the industrial zone. Emergency services are responding to investigate. No official confirmation of the cause or any casualties at this time.',
    source_platform: 'twitter',
    source_author: 'LocalNewsBreaking',
    location_name: 'Industrial Zone',
    latitude: 31.540,
    longitude: 34.500,
    distance_km: 6.8,
    trust_score: 45,
    priority_score: 70,
    relevance_tags: ['explosion', 'unconfirmed', 'industrial'],
    category: 'warning',
    severity: 'high',
    event_type: 'explosion',
    engagement_count: 7800,
    verified: false,
    published_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(), // 10 min ago
    created_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
  },
  {
    id: '10',
    title: 'Community shelter open for flood victims',
    summary: 'City opens emergency shelter at Sports Arena. Food and bedding provided.',
    content: 'The city has opened an emergency shelter at the Sports Arena for residents displaced by flooding. The shelter provides food, water, bedding, and basic medical services. Pets are allowed in a designated area.',
    source_platform: 'facebook',
    source_author: 'CityHallOfficial',
    location_name: 'Sports Arena',
    latitude: 31.508,
    longitude: 34.465,
    distance_km: 2.8,
    trust_score: 96,
    priority_score: 78,
    relevance_tags: ['shelter', 'flood', 'emergency', 'help'],
    category: 'info',
    severity: 'medium',
    event_type: 'shelter',
    engagement_count: 1240,
    verified: true,
    published_at: new Date(Date.now() - 1.5 * 60 * 60 * 1000).toISOString(), // 1.5 hours ago
    created_at: new Date(Date.now() - 88 * 60 * 1000).toISOString(),
  },
];

/**
 * Get news sorted by priority (highest first)
 */
export function getNewsByPriority(news: NewsArticle[] = DUMMY_NEWS): NewsArticle[] {
  return [...news].sort((a, b) => b.priority_score - a.priority_score);
}

/**
 * Get news sorted by recency (newest first)
 */
export function getNewsByRecency(news: NewsArticle[] = DUMMY_NEWS): NewsArticle[] {
  return [...news].sort((a, b) =>
    new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
  );
}

/**
 * Get news sorted by distance (closest first)
 */
export function getNewsByDistance(news: NewsArticle[] = DUMMY_NEWS): NewsArticle[] {
  return [...news].sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
}

/**
 * Filter news by category
 */
export function filterByCategory(news: NewsArticle[], category: string): NewsArticle[] {
  if (category === 'all') return news;
  return news.filter(article => article.category === category);
}

/**
 * Filter news by minimum trust score
 */
export function filterByTrustScore(news: NewsArticle[], minScore: number): NewsArticle[] {
  return news.filter(article => article.trust_score >= minScore);
}

/**
 * Search news by title and summary
 */
export function searchNews(news: NewsArticle[], query: string): NewsArticle[] {
  const lowerQuery = query.toLowerCase();
  return news.filter(article =>
    article.title.toLowerCase().includes(lowerQuery) ||
    article.summary.toLowerCase().includes(lowerQuery) ||
    article.relevance_tags.some(tag => tag.toLowerCase().includes(lowerQuery))
  );
}

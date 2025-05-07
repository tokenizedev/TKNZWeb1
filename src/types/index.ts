export interface Token {
  id: string;
  name: string;
  ticker: string;
  thumbnail: string;
  launchTime: Date;
  pumpLink: string;
}

export interface RoadmapItem {
  title: string;
  description: string;
  status: 'completed' | 'in-progress' | 'upcoming';
  date: string;
}

export interface Partner {
  name: string;
  logo: string;
  description: string;
  link: string;
}
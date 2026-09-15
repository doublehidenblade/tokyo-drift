// Scene palettes, extracted verbatim from getSceneConfig() in chunk-01.tsx.

export type PrecipKind = 'rain' | 'snow' | 'leaves' | 'petals' | null;

export interface SceneConfig {
  isDay: boolean;
  skyTop: string;
  skyBot: string;
  sun: boolean;
  clouds: boolean;
  ground1: string;
  ground2: string;
  treeType: 'cherry' | 'green' | 'autumn' | 'snow' | 'wetgreen' | 'nightgreen';
  buildingLights: boolean;
  lampOn: boolean;
  precip: PrecipKind;
}

export const SCENE_META: Record<string, { label: string; icon: string }> = {
  spring: { label: 'SPRING', icon: '🌸' },
  summer: { label: 'SUMMER', icon: '☀️' },
  autumn: { label: 'AUTUMN', icon: '🍂' },
  winter: { label: 'WINTER', icon: '❄️' },
  rain: { label: 'RAIN', icon: '🌧' },
  night: { label: 'NIGHT', icon: '🌙' },
};

export const SCENES = Object.keys(SCENE_META);

export function getSceneConfig(scene: string, nightTop: string, nightBot: string): SceneConfig {
  switch (scene) {
    case 'spring':
      return { isDay: true, skyTop: '#7EC8FF', skyBot: '#E8F8FF', sun: true, clouds: true, ground1: '#9AD89A', ground2: '#D8F0D8', treeType: 'cherry', buildingLights: false, lampOn: false, precip: 'petals' };
    case 'summer':
      return { isDay: true, skyTop: '#6EC6FF', skyBot: '#D8F3FF', sun: true, clouds: true, ground1: '#a8d8a8', ground2: '#e8f5e8', treeType: 'green', buildingLights: false, lampOn: false, precip: null };
    case 'autumn':
      return { isDay: true, skyTop: '#7EB8E8', skyBot: '#FDE8C8', sun: true, clouds: false, ground1: '#C8B888', ground2: '#E8D8B8', treeType: 'autumn', buildingLights: false, lampOn: false, precip: 'leaves' };
    case 'winter':
      return { isDay: true, skyTop: '#A8C8E8', skyBot: '#E8F0F8', sun: true, clouds: false, ground1: '#E8EEF5', ground2: '#FFFFFF', treeType: 'snow', buildingLights: false, lampOn: false, precip: 'snow' };
    case 'rain':
      return { isDay: true, skyTop: '#5B6B82', skyBot: '#9CA3AF', sun: false, clouds: true, ground1: '#7A8A7A', ground2: '#9AA8A8', treeType: 'wetgreen', buildingLights: false, lampOn: true, precip: 'rain' };
    case 'night':
      return { isDay: false, skyTop: nightTop, skyBot: nightBot, sun: false, clouds: false, ground1: '#1e1548', ground2: '#0a0a14', treeType: 'nightgreen', buildingLights: true, lampOn: true, precip: null };
    default:
      return { isDay: true, skyTop: '#6EC6FF', skyBot: '#D8F3FF', sun: true, clouds: true, ground1: '#a8d8a8', ground2: '#e8f5e8', treeType: 'green', buildingLights: false, lampOn: false, precip: null };
  }
}

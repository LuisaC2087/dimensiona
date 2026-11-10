export interface Point3 { x: number; y: number; z: number }
export interface Point2 { x: number; z: number }
export type TrackingState = 'good' | 'limited' | 'lost';
export type SurfaceKind = 'plane' | 'featurePoint';
export type ReliabilityLevel = 'Alta' | 'Media' | 'Baja';
export type Unit = 'm' | 'cm' | 'in' | 'ft-in';

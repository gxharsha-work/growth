import CapabilityBuilding from './CapabilityBuilding'
import KnowledgeGarden from './KnowledgeGarden'
import Landmark from './Landmark'
import CollaborationRoad from './CollaborationRoad'

// The four skill-coverage variants that share the CapabilityBuilding shape.
export const CAPABILITY_TYPE_IDS = [
  'capability-frontend',
  'capability-backend',
  'capability-qa',
  'capability-devops',
]

export const BUILDING_MODELS = {
  'capability-frontend': CapabilityBuilding,
  'capability-backend': CapabilityBuilding,
  'capability-qa': CapabilityBuilding,
  'capability-devops': CapabilityBuilding,
  knowledge: KnowledgeGarden,
  landmark: Landmark,
  road: CollaborationRoad,
}

import re

with open('Frontend/src/screens/Trip/TripDetailScreen.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Conflict 1
content = re.sub(
    r'<<<<<<< HEAD\nimport IslandMap from \'../../components/IslandMap/IslandMap\';\n=======\nimport RouteMap from \'../../components/RouteMap/RouteMap\';\nimport LocationTasks from \'./LocationTasks\';\nimport TaskDetail from \'./TaskDetail\';\n>>>>>>> origin/feature/tasks\nimport \'./TripDetailScreen\.css\';\nimport RouteMap from \'../../components/RouteMap/RouteMap\';\nimport Mascot from \'../../components/Mascot/Mascot\';\nimport TreasureOverlay from \'../../components/TreasureOverlay/TreasureOverlay\';\n\n<<<<<<< HEAD\nconst TripDetailScreen = \({ itineraryId, onBack, refreshUser, onPointsUpdate, user }\) => {\n=======\n// Hidden Quest imports\nimport { getActiveTasks, pingLocation, verifyQuest } from \'../../services/hiddenQuestService\';\nimport ChestOpeningAnimation from \'../../components/HiddenQuest/ChestOpeningAnimation\';\nimport HiddenQuestDebug from \'../../components/HiddenQuest/HiddenQuestDebug\';\n\nconst TripDetailScreen = \({ itineraryId, user, onBack }\) => {\n>>>>>>> origin/feature/tasks',
    '''import IslandMap from '../../components/IslandMap/IslandMap';
import LocationTasks from './LocationTasks';
import TaskDetail from './TaskDetail';
import './TripDetailScreen.css';
import RouteMap from '../../components/RouteMap/RouteMap';
import Mascot from '../../components/Mascot/Mascot';
import TreasureOverlay from '../../components/TreasureOverlay/TreasureOverlay';
// Hidden Quest imports
import { getActiveTasks, pingLocation, verifyQuest } from '../../services/hiddenQuestService';
import ChestOpeningAnimation from '../../components/HiddenQuest/ChestOpeningAnimation';
import HiddenQuestDebug from '../../components/HiddenQuest/HiddenQuestDebug';

const TripDetailScreen = ({ itineraryId, onBack, refreshUser, onPointsUpdate, user }) => {''',
    content
)

# Conflict 2
content = re.sub(
    r'<<<<<<< HEAD\n(    const \[cloudState, setCloudState\] = useState\(\'idle\'\);.*?)=======\n>>>>>>> origin/feature/tasks\n',
    r'\1',
    content,
    flags=re.DOTALL
)

# Conflict 3
content = re.sub(
    r'<<<<<<< HEAD\n\s*// Mở rương sau 1\.5 giây\n=======\n(.*?)>>>>>>> origin/feature/tasks\n',
    r'// Mở rương sau 1.5 giây\n\1',
    content,
    flags=re.DOTALL
)

# Conflict 4
content = re.sub(
    r'<<<<<<< HEAD\n(            \{\/\* Bản đồ Đảo \(Island Map\) thay thế RouteMap \*\/.*?)\s*=======\n(.*?<div className="trip-itinerary">)',
    r'\1\n\n\2',
    content,
    flags=re.DOTALL
)

with open('Frontend/src/screens/Trip/TripDetailScreen.js', 'w', encoding='utf-8') as f:
    f.write(content)

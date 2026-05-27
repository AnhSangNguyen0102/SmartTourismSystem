import os

filepath = r"c:\Users\Hieu\Desktop\SmartTourismSystem\Frontend\src\components\MainTabs.jsx"
components_filepath = r"c:\Users\Hieu\Desktop\SmartTourismSystem\scratch\components_code.js"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

with open(components_filepath, "r", encoding="utf-8") as f:
    components_code = f.read()

# Normalize line endings
content = content.replace("\r\n", "\n")
components_code = components_code.replace("\r\n", "\n")

# Replace states
target1 = """    // States for map search and weather
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [weatherInfo, setWeatherInfo] = useState(null);"""

replacement1 = "    // Map search, weather, and style states have been relocated to LocationScreen component"

if target1 in content:
    content = content.replace(target1, replacement1)
    print("Replaced states")
else:
    print("Warning: target1 not found")

# Replace fetch functions
target2 = """    const fetchWeather = async (lat, lon) => {
        try {
            const res = await fetch(`${API_BASE}/api/discovery/weather?lat=${lat}&lon=${lon}`);
            if (res.ok) {
                const data = await res.json();
                setWeatherInfo(data);
            }
        } catch (err) {
            console.error("Weather fetch failed", err);
        }
    };

    const fetchSearchResults = async (query) => {
        if (!query.trim()) {
            setSearchResults([]);
            return;
        }
        setSearchLoading(true);
        try {
            const coordsParam = userLocation ? `&lat=${userLocation.lat}&lon=${userLocation.lng}` : '';
            const res = await fetch(`${API_BASE}/api/discovery/geocode/search?q=${encodeURIComponent(query)}${coordsParam}`);
            if (res.ok) {
                const data = await res.json();
                setSearchResults(data);
            }
        } catch (err) {
            console.error("Geocoding search failed", err);
        } finally {
            setSearchLoading(false);
        }
    };"""

replacement2 = "    // Weather and search fetching logic moved to LocationScreen component"

if target2 in content:
    content = content.replace(target2, replacement2)
    print("Replaced fetch functions")
else:
    print("Warning: target2 not found")

# Replace useEffects
target3 = """    useEffect(() => {
        const delayDebounceFn = setTimeout(() => {
            if (searchQuery.trim()) {
                fetchSearchResults(searchQuery);
            } else {
                setSearchResults([]);
            }
        }, 500);

        return () => clearTimeout(delayDebounceFn);
    }, [searchQuery]);

    useEffect(() => {
        if (userLocation?.lat && userLocation?.lng && activeTab === 'location') {
            fetchWeather(userLocation.lat, userLocation.lng);
        }
    }, [userLocation, activeTab]);"""

replacement3 = "    // Map side-effects moved to LocationScreen component"

if target3 in content:
    content = content.replace(target3, replacement3)
    print("Replaced useEffects")
else:
    print("Warning: target3 not found")

# Replace map refs/states
target4 = """    const mapComponentRef = useRef(null);
    const [showMapSearch, setShowMapSearch] = useState(false);
    const [showMapMenu, setShowMapMenu] = useState(false);
    const [mapStyle, setMapStyle] = useState('voyager');
    const [showHiddenTasks, setShowHiddenTasks] = useState(true);"""

replacement4 = "    // Map component states and ref moved to LocationScreen component"

if target4 in content:
    content = content.replace(target4, replacement4)
    print("Replaced map refs/states")
else:
    print("Warning: target4 not found")

# Find and replace the big block of nested screens
start_pattern = "    const getWeatherEmoji = (code) => {"
end_pattern = """            default:
                return <Traveltrip />;
        }
    };"""

start_idx = content.find(start_pattern)
if start_idx != -1:
    end_idx = content.find(end_pattern, start_idx)
    if end_idx != -1:
        end_idx += len(end_pattern)
        # We replace the entire block with the new renderContent function
        new_render_content = """    // Render nội dung tương ứng với tab được chọn
    const renderContent = () => {
        switch (activeTab) {
            case 'home':
                return <Traveltrip
                    user={user} isGuest={isGuest}
                    onLogout={onLogout} onRequireLogin={onRequireLogin}
                    onOpenPlan={onOpenPlan} onOpenLocationRegister={onOpenLocationRegister}
                    onOpenProfileEdit={onOpenProfileEdit}
                    onOpenHistory={onOpenHistory}
                    onOpenTripDetail={onOpenTripDetail}
                />;
            case 'location':
                return isGuest ? <GuestPlaceholder title="Bản đồ & Lịch trình" icon={<MapPin size={48} />} onRequireLogin={onRequireLogin} /> : (
                    <LocationScreen
                        userLocation={userLocation}
                        userInfo={userInfo}
                        hiddenTasks={hiddenTasks}
                        handleHiddenTaskClick={handleHiddenTaskClick}
                        isGuest={isGuest}
                        fetchActiveTasks={fetchActiveTasks}
                        onTestClaim={(testTask) => {
                            setSelectedTask(testTask);
                            setShowChestAnimation(true);
                        }}
                    />
                );

            case 'leaderboard':
                return <Leaderboard />;

            case 'friends':
                return isGuest ? <GuestPlaceholder title="Cộng đồng Du lịch" icon={<Users size={48} />} onRequireLogin={onRequireLogin} /> : (
                    <FriendsScreen
                        userInfo={userInfo}
                        onRequireLogin={onRequireLogin}
                        setActiveTab={setActiveTab}
                    />
                );

            case 'favorites':
                return isGuest ? <GuestPlaceholder title="Địa điểm Yêu thích" icon={<Heart size={48} style={{ color: '#e74c3c' }} />} onRequireLogin={onRequireLogin} /> : <FavoritesScreen />;

            case 'profile':
                return isGuest ? <GuestPlaceholder title="Hồ sơ Cá nhân" icon={<User size={48} />} onRequireLogin={onRequireLogin} /> : (
                    <ProfileScreen
                        userInfo={userInfo}
                        level={level}
                        tierMeta={tierMeta}
                        expPercentage={expPercentage}
                        currentExp={currentExp}
                        pointsBalance={pointsBalance}
                        achievements={achievements}
                        achFilter={achFilter}
                        setAchFilter={setAchFilter}
                        loadingRewards={loadingRewards}
                        rewardsTab={rewardsTab}
                        setRewardsTab={setRewardsTab}
                        rewardsData={rewardsData}
                        handleRedeemVoucher={handleRedeemVoucher}
                        onOpenAdminModeration={onOpenAdminModeration}
                        onOpenHistory={onOpenHistory}
                        onOpenProfileEdit={onOpenProfileEdit}
                        onLogout={onLogout}
                    />
                );

            default:
                return <Traveltrip />;
        }
    };"""
        content = content[:start_idx] + new_render_content + content[end_idx:]
        print("Replaced nested screens and renderContent block successfully!")
    else:
        print("Error: end_pattern not found after start_pattern")
else:
    print("Error: start_pattern not found")

# Append components at the bottom of the file (before export default MainTabs;)
export_pattern = "export default MainTabs;"
export_idx = content.find(export_pattern)
if export_idx != -1:
    content = content[:export_idx] + components_code + "\n\n" + content[export_idx:]
    print("Appended external components successfully!")
else:
    print("Error: export pattern not found")

# Write file back
with open(filepath, "w", encoding="utf-8") as f:
    f.write(content.replace("\n", "\r\n")) # Preserve Windows line endings
print("File written successfully!")

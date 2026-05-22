import re

with open('Frontend/src/components/RouteMap/RouteMap.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace callbacks with refs
ref_setup = """    const onStopClickRef = useRef(onStopClick);
    const onHiddenTaskClickRef = useRef(onHiddenTaskClick);
    useEffect(() => {
        onStopClickRef.current = onStopClick;
        onHiddenTaskClickRef.current = onHiddenTaskClick;
    }, [onStopClick, onHiddenTaskClick]);

    // 1. VẼ LỘ TRÌNH TĨNH"""

content = content.replace('    // 1. VẼ LỘ TRÌNH TĨNH', ref_setup)

content = content.replace(
    '''            marker.on('click', () => {
                if (onStopClick) {
                    onStopClick(stop);
                }
            });''',
    '''            marker.on('click', () => {
                if (onStopClickRef.current) {
                    onStopClickRef.current(stop);
                }
            });'''
)

content = content.replace(
    "taskMarker.on('click', () => { if (onHiddenTaskClick) onHiddenTaskClick(task); });",
    "taskMarker.on('click', () => { if (onHiddenTaskClickRef.current) onHiddenTaskClickRef.current(task); });"
)

# Replace the dependency array
content = re.sub(
    r'    \}, \[stops, routes, hiddenTasks, onStopClick, onHiddenTaskClick\]\);',
    r'    // eslint-disable-next-line react-hooks/exhaustive-deps\n    }, [JSON.stringify(stops), JSON.stringify(routes), JSON.stringify(hiddenTasks)]);',
    content
)

with open('Frontend/src/components/RouteMap/RouteMap.js', 'w', encoding='utf-8') as f:
    f.write(content)

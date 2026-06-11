import React, { useState, useEffect } from 'react';
import './IslandMap.css';

// Định nghĩa các vùng (hotspots) trên bản đồ tương ứng với các loại công trình
// Các con số left, top, width, height tính theo % so với kích thước gốc của bản đồ
const ISLAND_REGIONS = {
    temple: [
        { id: 't1', left: '30%', top: '16%', width: '10%', height: '10%' },
        { id: 't2', left: '45%', top: '28%', width: '10%', height: '10%' },
        { id: 't3', left: '60%', top: '40%', width: '10%', height: '10%' },
        { id: 't4', left: '40%', top: '58%', width: '10%', height: '10%' }
    ],
    hotel: [
        { id: 'h1', left: '60%', top: '13%', width: '10%', height: '10%' },
        { id: 'h2', left: '25%', top: '22%', width: '10%', height: '10%' },
        { id: 'h3', left: '55%', top: '28%', width: '10%', height: '10%' },
        { id: 'h4', left: '50%', top: '52%', width: '10%', height: '10%' }
    ],
    park: [
        { id: 'p1', left: '50%', top: '13%', width: '10%', height: '10%' },
        { id: 'p2', left: '35%', top: '22%', width: '10%', height: '10%' },
        { id: 'p3', left: '65%', top: '28%', width: '10%', height: '10%' },
        { id: 'p4', left: '40%', top: '46%', width: '10%', height: '10%' }
    ],
    sea: [
        { id: 's1', left: '15%', top: '30%', width: '10%', height: '6%' },
        { id: 's2', left: '30%', top: '50%', width: '10%', height: '6%' },
        { id: 's3', left: '30%', top: '65%', width: '10%', height: '6%' },
        { id: 's4', left: '75%', top: '20%', width: '10%', height: '6%' },
        { id: 's5', left: '78%', top: '45%', width: '10%', height: '6%' },
        { id: 's6', left: '70%', top: '60%', width: '10%', height: '6%' },
        { id: 's7', left: '45%', top: '80%', width: '10%', height: '6%' },
        { id: 's8', left: '55%', top: '85%', width: '10%', height: '6%' }
    ],
    lake: [
        { id: 'l1', left: '40%', top: '16%', width: '10%', height: '10%' }, 
        { id: 'l2', left: '35%', top: '34%', width: '10%', height: '10%' },
        { id: 'l3', left: '50%', top: '46%', width: '10%', height: '10%' }
    ],
    mountain: [
        { id: 'm1', left: '50%', top: '16%', width: '10%', height: '10%' },
        { id: 'm2', left: '65%', top: '22%', width: '10%', height: '10%' },
        { id: 'm3', left: '45%', top: '34%', width: '10%', height: '10%' },
        { id: 'm4', left: '50%', top: '64%', width: '10%', height: '10%' }
    ],
    eco: [
        { id: 'e1', left: '60%', top: '16%', width: '10%', height: '10%' },
        { id: 'e2', left: '45%', top: '22%', width: '10%', height: '10%' },
        { id: 'e3', left: '60%', top: '46%', width: '10%', height: '10%' }
    ],
    restaurant: [
        { id: 'r1', left: '55%', top: '22%', width: '10%', height: '10%' },
        { id: 'r2', left: '25%', top: '28%', width: '10%', height: '10%' },
        { id: 'r3', left: '60%', top: '34%', width: '10%', height: '10%' },
        { id: 'r4', left: '50%', top: '58%', width: '10%', height: '10%' }
    ],
    house: [
        { id: 'ho1', left: '35%', top: '28%', width: '10%', height: '10%' },
        { id: 'ho2', left: '25%', top: '34%', width: '10%', height: '10%' },
        { id: 'ho3', left: '60%', top: '58%', width: '10%', height: '10%' }
    ],
    default: [
        { id: 'd1', left: '30%', top: '40%', width: '10%', height: '10%' },
        { id: 'd2', left: '40%', top: '52%', width: '10%', height: '10%' },
        { id: 'd3', left: '40%', top: '64%', width: '10%', height: '10%' }
    ]
};

const getBuildingType = (stop) => {
    // 1. Phân loại theo category_name từ database (Supabase) nếu có
    if (stop && stop.category_name) {
        const cat = stop.category_name.toLowerCase();
        if (cat.includes('lưu trú')) return 'hotel';
        if (cat.includes('quán ăn')) return 'restaurant';
        if (cat.includes('tham quan')) {
            // Refine specific types of attractions based on name
            const name = (stop.location_name || '').toLowerCase();
            if (name.includes('chùa') || name.includes('đền') || name.includes('lăng') || name.includes('miếu') || name.includes('nhà thờ') || name.includes('tự')) return 'temple';
            if (name.includes('biển') || name.includes('đảo') || name.includes('vịnh') || name.includes('bãi')) return 'sea';
            if (name.includes('hồ') || name.includes('sông') || name.includes('suối')) return 'lake';
            if (name.includes('núi') || name.includes('đồi') || name.includes('hang') || name.includes('đỉnh') || name.includes('đèo')) return 'mountain';
            if (name.includes('sinh thái') || name.includes('eco') || name.includes('rừng') || name.includes('quốc gia')) return 'eco';
            return 'park'; // Mặc định cho điểm tham quan
        }
    }

    // 2. Fallback: Dùng tên địa điểm
    const name = (stop && stop.location_name ? stop.location_name : '').toLowerCase();
    
    // 2.1 Temple / Pagoda / Church / Historical (Tôn giáo, lịch sử, di tích)
    if (name.includes('chùa') || name.includes('đền') || name.includes('lăng') || 
        name.includes('miếu') || name.includes('nhà thờ') || name.includes('tự') || 
        name.includes('thiền viện') || name.includes('hoàng thành') || 
        name.includes('văn miếu') || name.includes('đại nội') || 
        name.includes('cố đô') || name.includes('thánh địa')) return 'temple';

    // 2.2a Sea / Beach / Island (Biển, đảo, vịnh, bãi ngoài biển)
    if (name.includes('biển') || name.includes('đảo') || name.includes('vịnh') || 
        name.includes('bãi')) return 'sea';

    // 2.2b Lake / River / Stream (Sông, hồ, suối trong đất liền)
    if (name.includes('hồ') || name.includes('sông') || name.includes('suối')) return 'lake';

    // 2.2c Mountain / Hill / Cave (Núi, đồi, hang động, đèo)
    if (name.includes('núi') || name.includes('đồi') || name.includes('hang') || 
        name.includes('đỉnh') || name.includes('đèo')) return 'mountain';

    // 2.2c Nature Reserve / Eco (Sinh thái, rừng, vườn quốc gia)
    if (name.includes('sinh thái') || name.includes('eco') || name.includes('rừng') || 
        name.includes('thảo cầm viên') || name.includes('quốc gia')) return 'eco';

    // 2.3 Park / Amusement / Museum / Modern (Khu vui chơi, công viên, bảo tàng, hiện đại)
    if (name.includes('công viên') || name.includes('vườn') || name.includes('park') || 
        name.includes('khu vui chơi') || name.includes('vinwonders') || name.includes('bà nà') || 
        name.includes('bảo tàng') || name.includes('viện hải dương') || name.includes('đài quan sát') || 
        name.includes('landmark') || name.includes('cầu')) return 'park';

    // 2.4 Hotel / Resort (Khách sạn, Resort lớn)
    if (name.includes('khách sạn') || name.includes('hotel') || name.includes('resort') || 
        name.includes('retreat') || name.includes('grand') || name.includes('legend') || 
        name.includes('melia') || name.includes('boutique')) return 'hotel';

    // 2.5 House / Homestay / Village / Market / Theater (Làng nghề, phố, chợ, nhà hát, homestay)
    if (name.includes('nhà ở') || name.includes('homestay') || name.includes('house') || 
        name.includes('hostel') || name.includes('làng') || name.includes('phố') || 
        name.includes('chợ') || name.includes('nhà hát') || name.includes('show') || 
        name.includes('nhà tù') || name.includes('dinh') || name.includes('địa đạo')) return 'house';

    // 2.6 Restaurant / Food / Snack (Ẩm thực, ăn vặt, quán ăn)
    if (name.includes('quán') || name.includes('nhà hàng') || name.includes('restaurant') || 
        name.includes('phở') || name.includes('bún') || name.includes('mì') || 
        name.includes('cao lầu') || name.includes('cơm') || name.includes('bánh') || 
        name.includes('chè') || name.includes('kem') || name.includes('sữa chua')) return 'restaurant';
    
    return 'default';
};

const IslandMap = ({ stops = [], onBuildingClick }) => {
    const [assignedRegions, setAssignedRegions] = useState({});
    const [labelPositions, setLabelPositions] = useState({});
    const [hoveredStopId, setHoveredStopId] = useState(null);

    // Xử lý chống đè lên nhau (Collision Avoidance) cho các bong bóng chat
    useEffect(() => {
        if (!stops || stops.length === 0) return;

        const timer = setTimeout(() => {
            const bubbles = document.querySelectorAll('.building-name');
            const buildings = document.querySelectorAll('.hotspot-image-wrapper');
            
            const getRect = (el) => el.getBoundingClientRect();
            
            // Hàm kiểm tra 2 hình chữ nhật có đè lên nhau không (có margin đệm padding = 2px)
            const isOverlap = (rect1, rect2, padding = 2) => {
                return !(rect1.right + padding < rect2.left - padding || 
                         rect1.left - padding > rect2.right + padding || 
                         rect1.bottom + padding < rect2.top - padding || 
                         rect1.top - padding > rect2.bottom + padding);
            };

            const newPositions = {};
            let changed = false;

            bubbles.forEach((bubble) => {
                const stopId = bubble.getAttribute('data-stop-id');
                const classes = ['bubble-tr', 'bubble-tl', 'bubble-br', 'bubble-bl'];
                let currentClass = labelPositions[stopId] || 'bubble-tr';
                
                bubble.classList.remove(...classes);
                bubble.classList.add(currentClass);
                
                const checkCollision = (testRect) => {
                    // Kiểm tra chạm nhãn khác
                    for (let i = 0; i < bubbles.length; i++) {
                        const other = bubbles[i];
                        if (other !== bubble && isOverlap(testRect, getRect(other))) return true;
                    }
                    // Kiểm tra đè lên khu vực chính giữa của tòa nhà (tránh che khuất công trình)
                    for (let i = 0; i < buildings.length; i++) {
                        const bRect = getRect(buildings[i]);
                        const shrinkX = bRect.width * 0.25;
                        const shrinkY = bRect.height * 0.25;
                        const coreRect = {
                            left: bRect.left + shrinkX, right: bRect.right - shrinkX,
                            top: bRect.top + shrinkY, bottom: bRect.bottom - shrinkY
                        };
                        if (isOverlap(testRect, coreRect, 0)) return true;
                    }
                    return false;
                };

                let rect = getRect(bubble);
                if (checkCollision(rect)) {
                    for (let c of classes) {
                        if (c === currentClass) continue;
                        bubble.classList.remove(...classes);
                        bubble.classList.add(c);
                        rect = getRect(bubble);
                        if (!checkCollision(rect)) {
                            currentClass = c;
                            break;
                        }
                    }
                }
                
                if (currentClass !== (labelPositions[stopId] || 'bubble-tr')) {
                    changed = true;
                }
                newPositions[stopId] = currentClass;
            });

            if (changed) {
                setLabelPositions(newPositions);
            }
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stops, assignedRegions]);

    useEffect(() => {
        if (!stops || stops.length === 0) return;
        
        // Hàm băm chuỗi thành số để chọn ngẫu nhiên nhưng cố định (deterministic)
        const hashString = (str) => {
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                hash = ((hash << 5) - hash) + str.charCodeAt(i);
                hash = hash & hash;
            }
            return Math.abs(hash);
        };

        setAssignedRegions(prev => {
            const newAssignments = { ...prev };
            // Copy sâu để không làm hỏng dữ liệu gốc, giúp việc lấy phần tử và xóa an toàn
            const availableRegions = JSON.parse(JSON.stringify(ISLAND_REGIONS));
            let changed = false;

            stops.forEach(stop => {
                // Chỉ phân bổ vùng mới nếu stop này chưa có vùng gán
                if (!newAssignments[stop.stop_id]) {
                    changed = true;
                    const type = getBuildingType(stop);
                    
                    const usedRegionIds = Object.values(newAssignments).map(r => r.id);
                    
                    // Lọc các vùng chưa được sử dụng
                    let options = availableRegions[type] || [];
                    options = options.filter(r => !usedRegionIds.includes(r.id));

                    // Dự phòng 1: Dùng vùng default nếu hết vùng riêng
                    if (options.length === 0) {
                        options = availableRegions['default'].filter(r => !usedRegionIds.includes(r.id));
                    }

                    // Dự phòng 2: Nếu hết toàn bộ vùng default, chọn ngẫu nhiên lại từ vùng default (chấp nhận đè)
                    if (options.length === 0) { 
                        options = ISLAND_REGIONS['default'];
                    }

                    // Chọn chỉ mục cố định dựa trên ID của địa điểm thay vì random liên tục
                    const hashIndex = hashString(stop.stop_id.toString() + (stop.location_name || '')) % options.length;
                    const selected = options[hashIndex];
                    newAssignments[stop.stop_id] = selected;
                }
            });
            
            return changed ? newAssignments : prev;
        });
    }, [stops]);



    return (
        <div className="island-map-container">

            <div 
                className="island-background"
                style={{
                    backgroundImage: `url('${process.env.PUBLIC_URL || ''}/assets/island/map-dao.png')`,
                    backgroundSize: '100% 100%',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat',
                    cursor: 'crosshair'
                }}
            >
            </div>

            {/* Lớp 1: Tất cả các hình ảnh công trình (Nằm dưới cùng để không che nhãn) */}
            <div className="buildings-layer" style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, pointerEvents: 'none'}}>
                {[...stops]
                    .filter((stop) => assignedRegions[stop.stop_id])
                    .sort((a, b) => parseFloat(assignedRegions[a.stop_id].top) - parseFloat(assignedRegions[b.stop_id].top))
                    .map((stop) => {
                    const assignedRegion = assignedRegions[stop.stop_id];

                    const isCompleted = stop.status === 'COMPLETED';

                    return (
                        <div 
                            key={`b-${stop.stop_id}`} 
                            className={`island-hotspot ${isCompleted ? 'completed' : ''}`}
                            style={{ 
                                left: assignedRegion.left, top: assignedRegion.top,
                                width: assignedRegion.width, height: assignedRegion.height,
                                pointerEvents: 'auto'
                            }}
                        >
                            {isCompleted && <div className="checkin-flag" title="Đã check-in"><i className="fas fa-flag"></i></div>}
                            <div 
                                className="hotspot-image-wrapper"
                                onClick={() => onBuildingClick && onBuildingClick(stop)}
                                onMouseEnter={() => setHoveredStopId(stop.stop_id)}
                                onMouseLeave={() => setHoveredStopId(null)}
                                onTouchStart={() => setHoveredStopId(stop.stop_id)}
                                onTouchEnd={() => setHoveredStopId(null)}
                                onContextMenu={(e) => { e.preventDefault(); setHoveredStopId(null); }}
                                title={`Nhấn để xem: ${stop.location_name}`}
                            >
                                <img 
                                    src={`${process.env.PUBLIC_URL || ''}/assets/island/categories/${getBuildingType(stop)}.png`} 
                                    alt={stop.location_name} 
                                    className="hotspot-image"
                                    draggable="false"
                                    onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'block';
                                    }}
                                />
                                <div className="hotspot-click-fallback" style={{display: 'none'}}></div>
                            </div>
                        </div>
                    );
                })}
            </div>


            {/* Lớp 2: Tất cả các nhãn tên (Nằm trên cùng để trôi nổi hoàn toàn) */}
            <div className="labels-layer" style={{position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 20, pointerEvents: 'none'}}>
                {stops.map((stop) => {
                    const assignedRegion = assignedRegions[stop.stop_id];
                    if (!assignedRegion) return null;
                    const posClass = labelPositions[stop.stop_id] || 'bubble-tr';

                    return (
                        <div 
                            key={`l-${stop.stop_id}`} 
                            style={{ 
                                position: 'absolute',
                                left: assignedRegion.left, top: assignedRegion.top,
                                width: assignedRegion.width, height: assignedRegion.height
                            }}
                        >
                            <div 
                                className={`building-name ${posClass} ${hoveredStopId === stop.stop_id ? 'show-label' : ''}`} 
                                data-stop-id={stop.stop_id}
                                onClick={() => onBuildingClick && onBuildingClick(stop)}
                                onMouseEnter={() => setHoveredStopId(stop.stop_id)}
                                onMouseLeave={() => setHoveredStopId(null)}
                                style={{ pointerEvents: 'auto', cursor: 'pointer' }}
                            >
                                {stop.location_name}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default IslandMap;

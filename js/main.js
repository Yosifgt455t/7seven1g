
const app = {
    currentGame: null,
    gameConfig: {},

    // UI Navigation
    startApp: () => {
        app.showScreen('main-menu');
    },

    exitApp: () => {
        if (confirm('هل تريد الخروج حقاً؟')) {
            window.close(); // Works in PWA or script-opened windows
            // Fallback for normal tabs
            document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;color:white;flex-direction:column;"><h1>إلى اللقاء!</h1><p>يمكنك إغلاق النافذة الآن.</p></div>';
        }
    },

    showScreen: (screenId) => {
        document.querySelectorAll('.screen').forEach(s => {
            s.classList.remove('active');
            s.classList.add('hidden');
        });

        const screen = document.getElementById(screenId);
        screen.classList.remove('hidden');
        screen.classList.add('active');
    },

    selectGame: (gameType) => {
        console.log(`Selected game: ${gameType}`);
        app.gameConfig.type = gameType;

        // Update setup title based on game type
        const titles = {
            'misere': 'إكس أو المعكوسة',
            'circular': 'إكس أو الدائرية',
            'moving': 'إكس أو المتحركة',
            'color': 'إكس أو بالألوان',
            'snakes': 'السلالم والثعابين',
            'memory': 'الذاكرة القاتلة',
            'ultimate': 'إكس أو العملاقة'
        };
        document.getElementById('setup-title').innerText = titles[gameType];

        app.resetSetup(); // Ensure fresh state
        app.showScreen('game-setup');
    },

    goBack: () => {
        app.currentGame = null;
        app.showScreen('main-menu');
    },

    // Setup Options
    resetSetup: () => {
        document.querySelector('.setup-options').classList.remove('hidden');
        document.getElementById('ai-difficulty').classList.add('hidden');
        document.getElementById('ai-difficulty').style.display = 'none';
        document.getElementById('online-setup').classList.add('hidden');
        document.getElementById('online-setup').style.display = 'none';

        // Show main back button only in initial setup
        document.getElementById('main-back-btn').classList.remove('hidden');
    },

    startLocalGame: () => {
        app.startGame('local');
    },

    showAiDifficulty: () => {
        document.querySelector('.setup-options').classList.add('hidden');
        document.getElementById('ai-difficulty').classList.remove('hidden');
        document.getElementById('ai-difficulty').style.display = 'flex';
        document.getElementById('main-back-btn').classList.add('hidden'); // Hide main back
    },

    startAiGame: (difficulty) => {
        app.gameConfig.difficulty = difficulty;
        app.startGame('ai');
    },

    showOnlineSetup: () => {
        document.querySelector('.setup-options').classList.add('hidden');
        document.getElementById('online-setup').classList.remove('hidden');
        document.getElementById('online-setup').style.display = 'flex';
        document.getElementById('main-back-btn').classList.add('hidden'); // Hide main back
    },

    // Online Logic
    // Online Logic
    createRoom: async () => {
        const name = document.getElementById('p1-name').value.trim();
        if (!name) { alert('الرجاء إدخال اسمك'); return; }

        const result = await SupabaseClient.createRoom(app.gameConfig.type, name);
        if (result) {
            app.gameConfig.roomCode = result.room.code;
            app.gameConfig.playerId = result.playerId;
            app.gameConfig.role = result.role;
            app.gameConfig.opponentName = 'Waiting...';

            app.showWaitingModal(result.room.code);

            // Listen for player 2 joining
            SupabaseClient.subscribeToRoom(result.room.code, (updatedRoom) => {
                if (updatedRoom.status === 'playing') {
                    app.gameConfig.opponentName = updatedRoom.player2_name;
                    app.hideWaitingModal();
                    alert(`انضم اللاعب ${updatedRoom.player2_name}!`);
                    app.startGame('online');
                }
            });
        }
    },

    joinRoom: async () => {
        const name = document.getElementById('p2-name').value.trim();
        const code = document.getElementById('room-code-input').value.trim().toUpperCase();

        if (!name) { alert('الرجاء إدخال اسمك'); return; }
        if (!code) { alert('الرجاء إدخال رمز الغرفة'); return; }

        const result = await SupabaseClient.joinRoom(code, name);
        if (result) {
            app.gameConfig.roomCode = result.room.code;
            app.gameConfig.playerId = result.playerId;
            app.gameConfig.role = result.role;
            app.gameConfig.opponentName = result.room.player1_name;

            app.startGame('online');
        }
    },

    showWaitingModal: (code) => {
        document.getElementById('room-code-display').innerText = code;
        document.getElementById('waiting-modal').classList.remove('hidden');
    },

    hideWaitingModal: () => {
        document.getElementById('waiting-modal').classList.add('hidden');
    },

    copyRoomCode: () => {
        const code = document.getElementById('room-code-display').innerText;
        navigator.clipboard.writeText(code);
        alert('تم نسخ الرمز!');
    },

    // Game Launcher
    startGame: (mode) => {
        app.gameConfig.mode = mode;

        // Reset setup screens
        document.querySelector('.setup-options').classList.remove('hidden');
        document.getElementById('ai-difficulty').classList.add('hidden');
        document.getElementById('online-setup').classList.add('hidden');

        app.showScreen('game-screen');

        // Hide restart button if online (simplified for now)
        const restartBtn = document.getElementById('restart-btn');
        if (mode === 'online') {
            restartBtn.style.display = 'none';
        } else {
            restartBtn.style.display = 'block';
        }

        // Dynamically load the game logic
        app.loadGameLogic();
    },

    restartGame: () => {
        if (confirm('هل أنت متأكد من إعادة اللعبة؟')) {
            app.loadGameLogic(true); // true = force restart / skip rules
        }
    },

    loadGameLogic: (isRestart = false) => {
        const container = document.getElementById('game-container');
        container.innerHTML = ''; // Clear previous game

        const gameType = app.gameConfig.type;
        document.getElementById('game-title').innerText = document.getElementById('setup-title').innerText;

        // Show "How to Play" (only first time)
        const hasSeenRules = localStorage.getItem(`seen_rules_${gameType}`);

        if (!isRestart && !hasSeenRules) {
            const rules = {
                'misere': 'القاعدة: من يكوّن 3 رموز متتالية يخسر! حاول إجبار خصمك على تكوين الخط.',
                'circular': 'القاعدة: 8 خانات دائرية وواحدة في الوسط. الفوز بـ 3 متجاورة على المحيط أو خط يمر بالمركز.',
                'moving': 'القاعدة: لديك 3 قطع فقط. ضعها أولاً، ثم حرك قطعة واحدة خطوة واحدة في كل دور لتشكيل خط.',
                'color': 'القاعدة: لكل خانة نقاط (المركز 3، الزوايا 2، الحواف 1). الفوز بتشكيل خط مجموعه 6 نقاط أو أكثر.',
                'snakes': 'القاعدة: ارمِ النرد وتقدم. السلالم ترفعك للأعلى، والثعابين تنزلك للأسفل. أول من يصل لـ 36 يفوز.',
                'memory': 'القاعدة: اكشف بطاقتين. إذا تطابقتا، خذهما والعب مجدداً. احذر البطاقات الخاصة!',
                'ultimate': 'القاعدة: 9 ألعاب إكس أو صغيرة. حركتك تحدد اللوحة التي سيلعب فيها خصمك. الفوز بـ 3 لوحات كاملة.'
            };
            document.getElementById('rules-text').innerText = rules[gameType];
            document.getElementById('how-to-play').classList.remove('hidden');

            // Mark as seen immediately or on close? On close usually better but here is fine.
        }

        // Placeholder for game initialization
        if (gameType === 'misere') {
            window.currentGame = new MisereTTT(container, app.gameConfig);
            return;
        }
        if (gameType === 'circular') {
            window.currentGame = new CircularTTT(container, app.gameConfig);
            return;
        }
        if (gameType === 'moving') {
            window.currentGame = new MovingTTT(container, app.gameConfig);
            return;
        }
        if (gameType === 'color') {
            window.currentGame = new ColorTTT(container, app.gameConfig);
            return;
        }
        if (gameType === 'snakes') {
            window.currentGame = new SnakesLadders(container, app.gameConfig);
            return;
        }
        if (gameType === 'memory') {
            window.currentGame = new MemoryDuel(container, app.gameConfig);
            return;
        }
        if (gameType === 'ultimate') {
            window.currentGame = new UltimateTTT(container, app.gameConfig);
            return;
        }

        container.innerHTML = `<div style="text-align:center; padding: 20px;">
            <h3>جاري تحميل لعبة ${gameType}...</h3>
            <p>سيتم تنفيذ منطق اللعبة في الخطوة التالية.</p>
        </div>`;
    },

    closeRules: () => {
        document.getElementById('how-to-play').classList.add('hidden');
        const gameType = app.gameConfig.type;
        localStorage.setItem(`seen_rules_${gameType}`, 'true');
    },

    quitGame: () => {
        // If online, maybe notify server?
        app.goBack();
    }
};


class SnakesLadders {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.playersProp = {
            'P1': { pos: 1, color: '#ef4444' },
            'P2': { pos: 1, color: '#3b82f6' }
        };
        this.currentPlayer = 'P1';
        this.gameOver = false;

        // Map: Start -> End
        this.snakes = { 31: 14, 21: 9, 16: 4 };
        this.ladders = { 6: 17, 13: 28, 24: 35 };

        // Online setup
        this.roomCode = config.roomCode;
        this.myRole = config.role; // P1 or P2
        this.mySymbol = this.myRole === 'player2' ? 'P2' : 'P1';

        this.init();
    }

    init() {
        this.render();
        if (this.config.mode === 'online') {
            this.setupOnlineListeners();
        }
    }

    setupOnlineListeners() {
        SupabaseClient.subscribeToRoom(this.roomCode, (room) => {
            if (room.board_state && room.board_state.players) {
                this.playersProp = room.board_state.players;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'P1' ? 'P2' : 'P1');
                this.updateBoardUI();
                this.checkWinCondition(false);
            }
        });
    }

    render() {
        // Create 36 cells.
        // Needs a map from visual index 0-35 to board number 1-36.
        let cellsHtml = '';

        // Rows 0 to 5
        for (let row = 0; row < 6; row++) {
            for (let col = 0; col < 6; col++) {
                // Calculate Board Number based on zigzag
                let boardNum;
                // Visual Row 0 is logical row 5 (top)
                const logicalRow = 5 - row; // 5,4,3,2,1,0

                if (logicalRow % 2 === 0) {
                    // Even row 0, 2, 4 -> Left to Right (1-6, 13-18, 25-30)
                    boardNum = (logicalRow * 6) + col + 1;
                } else {
                    // Odd row 1, 3, 5 -> Right to Left (12-7, 24-19, 36-31)
                    boardNum = (logicalRow * 6) + (6 - col);
                }

                // Check for features
                let feature = '';
                if (this.snakes[boardNum]) feature = `<span class="feature snake">🐍 to ${this.snakes[boardNum]}</span>`;
                if (this.ladders[boardNum]) feature = `<span class="feature ladder">🪜 to ${this.ladders[boardNum]}</span>`;

                cellsHtml += `
                    <div class="cell snake-cell" data-num="${boardNum}">
                        <span class="cell-num">${boardNum}</span>
                        ${feature}
                        <div class="players-container" id="cell-${boardNum}">
                            <!-- Players injected here -->
                        </div>
                    </div>
                `;
            }
        }

        this.container.innerHTML = `
            <div class="snakes-layout">
                <div class="snakes-board">
                    ${cellsHtml}
                </div>
                <div class="controls-area">
                    <button id="roll-btn" class="btn btn-primary" onclick="currentGame.rollDice()">🎲 ارمِ النرد</button>
                    <div id="dice-result" class="dice-display"></div>
                </div>
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            .snakes-layout {
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 15px;
            }
            .snakes-board {
                display: grid;
                grid-template-columns: repeat(6, 1fr);
                gap: 2px;
                width: 360px;
                height: 360px;
                background: rgba(255, 255, 255, 0.05);
                border: 2px solid rgba(255, 255, 255, 0.1);
            }
            .snake-cell {
                position: relative;
                background: rgba(255, 255, 255, 0.1);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                font-size: 0.7rem;
            }
            .cell-num {
                position: absolute;
                top: 2px; left: 2px;
                opacity: 0.5;
            }
            .feature {
                font-size: 0.6rem;
                margin-top: 10px;
            }
            .snake { color: #ef4444; }
            .ladder { color: #22c55e; }
            
            .players-container {
                display: flex;
                gap: 2px;
                margin-top: 5px;
            }
            .player-token {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                border: 1px solid white;
                box-shadow: 0 0 5px rgba(0,0,0,0.5);
                transition: all 0.5s ease;
            }

            .controls-area {
                display: flex;
                gap: 10px;
                align-items: center;
            }
            .dice-display {
                font-size: 1.5rem;
                font-weight: bold;
                color: var(--accent-color);
                width: 40px;
                text-align: center;
            }
        `;
        this.container.appendChild(style);
        this.updateBoardUI();
    }

    updateBoardUI() {
        // Clear old positions
        this.container.querySelectorAll('.player-token').forEach(el => el.remove());

        // Add tokens
        ['P1', 'P2'].forEach(p => {
            const pos = this.playersProp[p].pos;
            const cell = document.getElementById(`cell-${pos}`);
            if (cell) {
                const token = document.createElement('div');
                token.className = 'player-token';
                token.style.backgroundColor = this.playersProp[p].color;
                token.title = p;
                cell.appendChild(token);
            }
        });

        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        const rollBtn = document.getElementById('roll-btn');

        if (this.gameOver) return;

        let canRoll = true;
        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === this.mySymbol);
            statusEl.innerText = isMyTurn ? 'دورك!' : 'دور الخصم...';
            canRoll = isMyTurn;
        } else {
            statusEl.innerText = `الدور: ${this.currentPlayer === 'P1' ? 'اللاعب 1 (أحمر)' : 'اللاعب 2 (أزرق)'}`;
        }

        if (canRoll) {
            rollBtn.disabled = false;
            rollBtn.style.opacity = '1';
        } else {
            rollBtn.disabled = true;
            rollBtn.style.opacity = '0.5';
        }
    }

    async rollDice() {
        if (this.gameOver) return;

        // Disable button during animation/processing
        document.getElementById('roll-btn').disabled = true;

        const diceVal = Math.floor(Math.random() * 6) + 1;
        document.getElementById('dice-result').innerText = diceVal;

        // Animate Move
        await this.movePlayer(this.currentPlayer, diceVal);

        // Check Win
        if (this.checkWinCondition()) return;

        // Switch Turn
        this.currentPlayer = this.currentPlayer === 'P1' ? 'P2' : 'P1';
        this.updateStatus();

        // Online Sync
        if (this.config.mode === 'online') {
            SupabaseClient.sendMove(
                this.roomCode,
                { players: this.playersProp }, // simplistic sync
                null,
                { dice: diceVal }
            );
        }

        // AI Turn
        if (this.config.mode === 'ai' && this.currentPlayer === 'P2') {
            setTimeout(() => this.rollDice(), 1000); // Auto roll for AI
        }
    }

    async movePlayer(player, steps) {
        let currentPos = this.playersProp[player].pos;
        let targetPos = currentPos + steps;

        // Exact finish rule
        if (targetPos > 36) {
            const excess = targetPos - 36;
            targetPos = 36 - excess; // Bounce back
        }

        // Update basic move
        this.playersProp[player].pos = targetPos;
        this.updateBoardUI();

        // Check for Snake/Ladder (delay for visual effect)
        await new Promise(r => setTimeout(r, 500));

        if (this.snakes[targetPos]) {
            this.playersProp[player].pos = this.snakes[targetPos];
            this.updateBoardUI();
        } else if (this.ladders[targetPos]) {
            this.playersProp[player].pos = this.ladders[targetPos];
            this.updateBoardUI();
        }
    }

    checkWinCondition(triggerUI = true) {
        const p1Win = this.playersProp['P1'].pos === 36;
        const p2Win = this.playersProp['P2'].pos === 36;

        if (p1Win || p2Win) {
            if (triggerUI) this.endGame(p1Win ? 'اللاعب 1' : 'اللاعب 2');
            return true;
        }
        return false;
    }

    endGame(winner) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');
        statusEl.innerText = `الفائز: ${winner}!`;
        statusEl.style.color = '#22c55e';
        document.getElementById('roll-btn').disabled = true;
    }
}

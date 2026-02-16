
class ColorTTT {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.board = Array(9).fill(null);
        this.currentPlayer = 'X';
        this.gameOver = false;

        // Points map
        // 0 1 2
        // 3 4 5
        // 6 7 8
        // Center: 4 (3pts). Corners: 0,2,6,8 (2pts). Edges: 1,3,5,7 (1pt).
        this.pointsMap = {
            4: 3,
            0: 2, 2: 2, 6: 2, 8: 2,
            1: 1, 3: 1, 5: 1, 7: 1
        };

        // Online setup
        this.roomCode = config.roomCode;
        this.myRole = config.role;
        this.mySymbol = this.myRole === 'player2' ? 'O' : 'X';

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
            if (room.board_state && room.board_state.board) {
                this.board = room.board_state.board;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'X' ? 'O' : 'X');
                this.updateBoardUI();
                this.checkWinCondition(false);
            }
        });
    }

    render() {
        this.container.innerHTML = `
            <div class="color-board">
                ${this.board.map((cell, index) => {
            const points = this.pointsMap[index];
            let uiPoints = '';
            // Visualize points? maybe dots or number
            if (!cell) uiPoints = `<span class="points-hint">${points}</span>`;

            return `
                    <div class="cell color-cell p-${points}" data-index="${index}" onclick="currentGame.handleCellClick(${index})">
                        ${cell || uiPoints}
                    </div>
                `}).join('')}
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            .color-board {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 10px;
                width: 300px;
                height: 300px;
                margin: 0 auto;
            }
            .color-cell {
                position: relative;
                background: rgba(255, 255, 255, 0.1);
                border: 2px solid rgba(255, 255, 255, 0.2);
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 2.5rem;
                cursor: pointer;
            }
            .color-cell.p-3 { background: rgba(234, 179, 8, 0.15); border-color: rgba(234, 179, 8, 0.3); } /* Yellow tint for high value */
            .color-cell.p-2 { background: rgba(147, 51, 234, 0.1); }
            
            .points-hint {
                font-size: 1rem;
                color: rgba(255, 255, 255, 0.3);
            }
        `;
        this.container.appendChild(style);
        this.updateStatus();
    }

    updateBoardUI() {
        const cells = this.container.querySelectorAll('.color-cell');
        this.board.forEach((cell, i) => {
            const el = cells[i];

            if (cell) {
                el.innerText = cell;
                el.className = `cell color-cell p-${this.pointsMap[i]} ${cell.toLowerCase()}`;
            } else {
                el.innerHTML = `<span class="points-hint">${this.pointsMap[i]}</span>`;
                el.className = `cell color-cell p-${this.pointsMap[i]}`;
            }
        });
        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        if (this.gameOver) return;

        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            statusEl.innerText = isMyTurn ? 'دورك!' : 'دور الخصم...';
        } else {
            statusEl.innerText = `الدور: ${this.currentPlayer}`;
        }
    }

    async handleCellClick(index) {
        if (this.gameOver || this.board[index]) return;

        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === 'X' && this.myRole === 'player1') ||
                (this.currentPlayer === 'O' && this.myRole === 'player2');
            if (!isMyTurn) return;
        }

        this.makeMove(index, this.currentPlayer);

        if (this.checkWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();

        if (this.config.mode === 'online') {
            SupabaseClient.sendMove(
                this.roomCode,
                { board: this.board },
                null,
                { index, player: this.board[index] }
            );
        }

        if (this.config.mode === 'ai' && !this.gameOver) {
            setTimeout(() => this.makeAiMove(), 500);
        }
    }

    makeMove(index, player) {
        this.board[index] = player;
        this.updateBoardUI();
    }

    makeAiMove() {
        const availableMoves = this.board.map((v, i) => v === null ? i : null).filter(v => v !== null);
        if (availableMoves.length === 0) return;

        let moveIndex;

        // Prioritize higher points
        // Sort moves by points desc
        availableMoves.sort((a, b) => this.pointsMap[b] - this.pointsMap[a]);

        if (this.config.difficulty === 'easy') {
            moveIndex = availableMoves[Math.floor(Math.random() * availableMoves.length)];
        } else {
            // Hard/Medium: Try to win, then block, then pick highest value
            const winningMove = availableMoves.find(idx => this.checkIfMoveWins(idx, this.currentPlayer));

            if (winningMove !== undefined) {
                moveIndex = winningMove;
            } else {
                const opp = this.currentPlayer === 'X' ? 'O' : 'X';
                const blockingMove = availableMoves.find(idx => this.checkIfMoveWins(idx, opp));

                if (blockingMove !== undefined) {
                    moveIndex = blockingMove;
                } else {
                    // Pick high value from sorted array
                    moveIndex = availableMoves[0];
                }
            }
        }

        this.makeMove(moveIndex, this.currentPlayer);
        if (this.checkWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();
    }

    checkIfMoveWins(index, player) {
        this.board[index] = player;
        const wins = this.getWinningLine(player);
        this.board[index] = null;
        return !!wins;
    }

    getWinningLine(player) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];

        return lines.find(line => {
            // Must have 3 of player
            if (!line.every(i => this.board[i] === player)) return false;

            // AND Sum >= 6
            const sum = line.reduce((acc, idx) => acc + this.pointsMap[idx], 0);
            return sum >= 6;
        });
    }

    checkWinCondition(triggerUI = true) {
        const winLine = this.getWinningLine(this.currentPlayer);

        if (winLine) {
            if (triggerUI) this.endGame(this.currentPlayer, winLine);
            return true;
        }

        if (!this.board.includes(null)) {
            if (triggerUI) this.endGame('draw');
            return true;
        }

        return false;
    }

    endGame(winner, winLine) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');
        if (winner === 'draw') {
            statusEl.innerText = 'تعادل!';
        } else {
            statusEl.innerText = `المنتصر: ${winner}!`;
            if (winLine) {
                winLine.forEach(idx => {
                    const cell = this.container.querySelector(`.cell[data-index="${idx}"]`);
                    if (cell) cell.classList.add('win');
                });
            }
        }
    }
}

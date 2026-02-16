
class UltimateTTT {
    constructor(container, config) {
        this.container = container;
        this.config = config;

        // 9 small boards: 0-8. Each is Array(9).
        this.smallBoards = Array(9).fill(null).map(() => Array(9).fill(null));
        // Big board status: null, 'X', 'O', or 'tie'
        this.bigBoard = Array(9).fill(null);

        this.currentPlayer = 'X';
        this.nextTarget = null; // null means any board, else index 0-8
        this.lastMove = null; // for highlighting
        this.gameOver = false;

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
            if (room.board_state && room.board_state.bigBoard) {
                this.smallBoards = room.board_state.smallBoards;
                this.bigBoard = room.board_state.bigBoard;
                this.nextTarget = room.board_state.nextTarget;
                this.currentPlayer = room.current_turn === this.config.playerId ? this.mySymbol : (this.mySymbol === 'X' ? 'O' : 'X');
                this.lastMove = room.last_move; // sync highlight
                this.updateBoardUI();
                this.checkMegaWinCondition(false);
            }
        });
    }

    render() {
        this.container.innerHTML = `
            <div class="ultimate-board">
                ${this.bigBoard.map((bigCell, bigIndex) => `
                    <div class="small-board ${bigCell ? ('won-' + bigCell.toLowerCase()) : ''}" 
                         id="board-${bigIndex}" 
                         data-index="${bigIndex}">
                        ${this.renderSmallBoard(bigIndex)}
                    </div>
                `).join('')}
            </div>
            <div id="status-msg" class="status-message"></div>
        `;

        const style = document.createElement('style');
        style.innerHTML = `
            .ultimate-board {
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 5px;
                width: 320px;
                height: 320px;
                background: rgba(255,255,255,0.2); /* Separator lines */
                padding: 5px;
            }
            .small-board {
                background: var(--bg-color);
                display: grid;
                grid-template-columns: repeat(3, 1fr);
                gap: 2px;
                padding: 2px;
                position: relative;
                transition: box-shadow 0.3s;
            }
            .small-board.active-target {
                box-shadow: inset 0 0 10px #f59e0b;
                border: 1px solid #f59e0b;
            }
            .small-board.disabled-target {
                opacity: 0.6;
            }
            .u-cell {
                background: rgba(255,255,255,0.05);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 0.8rem;
                cursor: pointer;
            }
            .u-cell:hover { background: rgba(255,255,255,0.1); }
            .u-cell.x { color: #ef4444; }
            .u-cell.o { color: #3b82f6; }
            
            /* Win Overlays */
            .won-x::after, .won-o::after {
                content: '';
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 4rem;
                font-weight: bold;
                background: rgba(0,0,0,0.6);
            }
            .won-x::after { content: 'X'; color: #ef4444; }
            .won-o::after { content: 'O'; color: #3b82f6; }
            
            .last-move { background: rgba(255,255,255,0.2); }
        `;
        this.container.appendChild(style);
        this.updateBoardUI();
    }

    renderSmallBoard(bigIndex) {
        return this.smallBoards[bigIndex].map((cell, smallIndex) => `
            <div class="u-cell" data-big="${bigIndex}" data-small="${smallIndex}" onclick="currentGame.handleCellClick(${bigIndex}, ${smallIndex})">
                ${cell || ''}
            </div>
        `).join('');
    }

    updateBoardUI() {
        // Update cells content
        const boards = this.container.querySelectorAll('.small-board');
        boards.forEach(boardEl => {
            const bigIndex = parseInt(boardEl.getAttribute('data-index'));

            // Check win status of small board
            const status = this.bigBoard[bigIndex];
            boardEl.className = `small-board ${status ? ('won-' + status.toLowerCase()) : ''}`;

            // Highlight Target
            if (!this.gameOver && !status) {
                if (this.nextTarget === null || this.nextTarget === bigIndex) {
                    boardEl.classList.add('active-target');
                    boardEl.classList.remove('disabled-target');
                } else {
                    boardEl.classList.remove('active-target');
                    boardEl.classList.add('disabled-target');
                }
            } else {
                boardEl.classList.remove('active-target');
                if (status) boardEl.classList.remove('disabled-target'); // Show won status clearly
            }

            // Update inner cells
            const cells = boardEl.querySelectorAll('.u-cell');
            cells.forEach(cellEl => {
                const smallIndex = parseInt(cellEl.getAttribute('data-small'));
                const val = this.smallBoards[bigIndex][smallIndex];
                cellEl.innerText = val || '';
                cellEl.className = `u-cell ${val ? val.toLowerCase() : ''}`;

                // Highlight last move
                if (this.lastMove && this.lastMove.big === bigIndex && this.lastMove.small === smallIndex) {
                    cellEl.classList.add('last-move');
                }
            });
        });

        this.updateStatus();
    }

    updateStatus() {
        const statusEl = document.getElementById('status-msg');
        if (this.gameOver) return;

        let msg = '';
        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === this.mySymbol);
            msg = isMyTurn ? 'دورك!' : 'دور الخصم...';
        } else {
            msg = `الدور: ${this.currentPlayer}`;
        }

        statusEl.innerText = msg;
    }

    async handleCellClick(bigIndex, smallIndex) {
        if (this.gameOver) return;

        // Validation
        if (this.bigBoard[bigIndex]) return; // Board already won
        if (this.smallBoards[bigIndex][smallIndex]) return; // Cell occupied

        // Target check
        if (this.nextTarget !== null && this.nextTarget !== bigIndex) return;

        // Online check
        if (this.config.mode === 'online') {
            const isMyTurn = (this.currentPlayer === this.mySymbol);
            if (!isMyTurn) return;
        }

        this.makeMove(bigIndex, smallIndex, this.currentPlayer);

        if (this.checkMegaWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();

        if (this.config.mode === 'online') {
            SupabaseClient.sendMove(
                this.roomCode,
                {
                    smallBoards: this.smallBoards,
                    bigBoard: this.bigBoard,
                    nextTarget: this.nextTarget
                },
                null,
                { big: bigIndex, small: smallIndex }
            );
        }

        if (this.config.mode === 'ai' && !this.gameOver) {
            setTimeout(() => this.makeAiMove(), 500);
        }
    }

    makeMove(bigIndex, smallIndex, player) {
        this.smallBoards[bigIndex][smallIndex] = player;
        this.lastMove = { big: bigIndex, small: smallIndex };

        // Check if small board won
        if (this.checkSmallWin(bigIndex, player)) {
            this.bigBoard[bigIndex] = player;
        } else if (this.checkSmallDraw(bigIndex)) {
            this.bigBoard[bigIndex] = 'tie'; // Logic for tie? Treat as null for win lines, or as blockage?
            // Usually acts as neutral.
        }

        // Set next target
        // Next target is determined by 'smallIndex'
        // If the board at 'smallIndex' is NOT won/full, then that's the target.
        // Else, nextTarget is null (any).
        if (!this.bigBoard[smallIndex]) { // If target board is playable
            this.nextTarget = smallIndex;
        } else {
            this.nextTarget = null;
        }

        this.updateBoardUI();
    }

    checkSmallWin(bigIndex, player) {
        const board = this.smallBoards[bigIndex];
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];
        return lines.some(line => line.every(i => board[i] === player));
    }

    checkSmallDraw(bigIndex) {
        return !this.smallBoards[bigIndex].includes(null);
    }

    checkMegaWinCondition(triggerUI = true) {
        const lines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8],
            [0, 3, 6], [1, 4, 7], [2, 5, 8],
            [0, 4, 8], [2, 4, 6]
        ];

        const winner = lines.find(line => line.every(i => this.bigBoard[i] === this.currentPlayer));

        if (winner) {
            if (triggerUI) this.endGame(this.currentPlayer, winner);
            return true;
        }

        // Check full/draw?
        if (!this.bigBoard.includes(null)) { // and no winner found
            if (triggerUI) this.endGame('Draw');
            return true;
        }

        return false;
    }

    makeAiMove() {
        // AI Logic
        // Determine valid big boards
        let validBigIndices = [];
        if (this.nextTarget !== null) {
            validBigIndices = [this.nextTarget];
        } else {
            validBigIndices = this.bigBoard.map((v, i) => v === null ? i : null).filter(v => v !== null);
        }

        if (validBigIndices.length === 0) return;

        // Simple Heuristic AI:
        // 1. Try to win small board.
        // 2. Play Random.
        // (Advanced AI would consider sending opponent to a won board to get free turn, etc.)

        // Pick random valid board for now (or improve slightly)
        const targetBig = validBigIndices[Math.floor(Math.random() * validBigIndices.length)];

        // Pick move in small board
        const smallBoard = this.smallBoards[targetBig];
        const validSmallLines = [
            [0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]
        ];

        // Try to win small board?
        let moveIndex = -1;

        if (this.config.difficulty !== 'easy') {
            // Check winning move
            for (let i = 0; i < 9; i++) {
                if (smallBoard[i] === null) {
                    smallBoard[i] = this.currentPlayer;
                    if (this.checkSmallWin(targetBig, this.currentPlayer)) {
                        moveIndex = i;
                        smallBoard[i] = null;
                        break;
                    }
                    smallBoard[i] = null;
                }
            }
        }

        if (moveIndex === -1) {
            const available = smallBoard.map((v, i) => v === null ? i : null).filter(v => v !== null);
            moveIndex = available[Math.floor(Math.random() * available.length)];
        }

        this.makeMove(targetBig, moveIndex, this.currentPlayer);
        if (this.checkMegaWinCondition()) return;

        this.currentPlayer = this.currentPlayer === 'X' ? 'O' : 'X';
        this.updateStatus();
    }

    endGame(winner, winLine) {
        this.gameOver = true;
        const statusEl = document.getElementById('status-msg');
        statusEl.innerText = `المنتصر: ${winner}!`;
        statusEl.style.color = '#22c55e';
    }
}

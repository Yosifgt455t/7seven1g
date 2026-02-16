
// Supabase Configuration
const PROJECT_URL = 'https://swbqesxtfmpfsmrovqpb.supabase.co';
const ANON_KEY = 'sb_publishable_UvO8MhUsqxRja0S_BWuE3A_nxXXzOYG'; // Using provided key

const supabase = window.supabase.createClient(PROJECT_URL, ANON_KEY);

const SupabaseClient = {
    // Generate a simple room code (6 characters)
    // Generate a simple room code (6 characters)
    generateRoomCode: () => {
        return Math.random().toString(36).substring(2, 8).toUpperCase();
    },

    // UUID Generator for non-secure contexts
    generateUUID: () => {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    },

    // Create a new room
    createRoom: async (gameType, playerName) => {
        const roomCode = SupabaseClient.generateRoomCode();
        const playerId = SupabaseClient.generateUUID();

        const { data, error } = await supabase
            .from('rooms')
            .insert([
                {
                    code: roomCode,
                    game_type: gameType,
                    player1_id: playerId,
                    player1_name: playerName,
                    status: 'waiting'
                }
            ])
            .select()
            .single();

        if (error) {
            console.error('Error creating room:', error);
            alert('حدث خطأ أثناء إنشاء الغرفة: ' + error.message);
            return null;
        }

        return { room: data, playerId, role: 'player1' };
    },

    // Join an existing room
    joinRoom: async (roomCode, playerName) => {
        // First check
        const { data: room, error: fetchError } = await supabase
            .from('rooms')
            .select('*')
            .eq('code', roomCode)
            .single();

        if (fetchError || !room) {
            alert('الغرفة غير موجودة.');
            return null;
        }

        if (room.status !== 'waiting') {
            alert('الغرفة ممتلئة أو بدأت بالفعل.');
            return null;
        }

        const playerId = SupabaseClient.generateUUID();

        // Update room to join
        const { error: updateError } = await supabase
            .from('rooms')
            .update({
                player2_id: playerId,
                player2_name: playerName,
                status: 'playing'
            })
            .eq('code', roomCode);

        if (updateError) {
            console.error('Error joining room:', updateError);
            alert('حدث خطأ أثناء الانضمام: ' + updateError.message);
            return null;
        }

        return { room: { ...room, player2_id: playerId, player2_name: playerName }, playerId, role: 'player2' };
    },

    // Subscribe to room updates
    subscribeToRoom: (roomCode, callback) => {
        const channel = supabase.channel(`room:${roomCode}`)
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${roomCode}` },
                (payload) => {
                    callback(payload.new);
                }
            )
            .subscribe();

        return channel;
    },

    // Send a move
    sendMove: async (roomCode, boardState, nextTurn, lastMove) => {
        await supabase
            .from('rooms')
            .update({
                board_state: boardState,
                current_turn: nextTurn,
                last_move: lastMove
            })
            .eq('code', roomCode);
    }
};

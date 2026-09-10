const express = require("express");
const http = require("http");
const WebSocket = require("ws");

const {
    TikTokLiveConnection,
    WebcastEvent
} = require("tiktok-live-connector");

const app = express();

const server = http.createServer(app);

const wss = new WebSocket.Server({
    server
});

const PORT =
    process.env.PORT || 10000;

let tiktokConnection = null;

let currentUsername = null;


/* =========================
   الصفحة الرئيسية
========================= */

app.get("/", (req, res) => {

    res.sendFile(
        __dirname + "/index.html"
    );

});


/* =========================
   حالة السيرفر
========================= */

app.get("/status", (req, res) => {

    res.json({

        connected:
            !!tiktokConnection,

        username:
            currentUsername

    });

});


/* =========================
   استخراج اسم حساب TikTok
========================= */

function getUsername(input) {

    input =
        String(input || "")
        .trim();

    if (!input) {
        return null;
    }

    try {

        if (
            input.startsWith("http://") ||
            input.startsWith("https://")
        ) {

            const url =
                new URL(input);

            const match =
                url.pathname.match(
                    /@([^/]+)/
                );

            if (match) {

                return match[1];

            }

        }

    } catch (error) {

        console.log(
            "Invalid URL"
        );

    }


    return input
        .replace("@", "")
        .replace(/\s/g, "");

}


/* =========================
   إرسال رسالة لكل الألعاب
========================= */

function broadcast(data) {

    const message =
        JSON.stringify(data);

    wss.clients.forEach(
        client => {

            if (
                client.readyState ===
                WebSocket.OPEN
            ) {

                client.send(message);

            }

        }
    );

}


/* =========================
   WebSocket
========================= */

wss.on(
    "connection",
    socket => {

        console.log(
            "Game connected"
        );


        socket.send(
            JSON.stringify({

                type: "status",

                connected:
                    !!tiktokConnection,

                username:
                    currentUsername

            })
        );


        socket.on(
            "close",
            () => {

                console.log(
                    "Game disconnected"
                );

            }
        );

    }
);


/* =========================
   الاتصال بـ TikTok LIVE
========================= */

async function connectTikTok(
    input
) {

    const username =
        getUsername(input);


    if (!username) {

        throw new Error(
            "TikTok username is required"
        );

    }


    /* فصل الاتصال القديم */

    if (tiktokConnection) {

        try {

            await tiktokConnection.disconnect();

        } catch (error) {

            console.log(
                "Old connection closed"
            );

        }

        tiktokConnection = null;

    }


    console.log(
        "Connecting to @" +
        username
    );


    const connection =
        new TikTokLiveConnection(
            username
        );


    tiktokConnection =
        connection;

    currentUsername =
        username;


    /* =====================
       اتصال ناجح
    ===================== */

    connection.on(
        "connected",
        () => {

            console.log(
                "TikTok LIVE connected!"
            );


            broadcast({

                type: "status",

                connected: true,

                username

            });

        }
    );


    /* =====================
       التعليقات
    ===================== */

    connection.on(
        WebcastEvent.CHAT,
        data => {

            const comment =
                String(
                    data.comment || ""
                ).trim();


            console.log(
                data.user?.uniqueId +
                ": " +
                comment
            );


            /*
             يسمح فقط برقم واحد
             من 1 إلى 20
            */

            if (
                !/^\d{1,2}$/.test(
                    comment
                )
            ) {

                return;

            }


            const number =
                Number(comment);


            if (
                number < 1 ||
                number > 20
            ) {

                return;

            }


            /* إرسال رقم الخانة */

            broadcast({

                type: "cell",

                cell: number,

                username:
                    data.user?.uniqueId ||
                    "unknown"

            });

        }
    );


    /* =====================
       انتهاء البث
    ===================== */

    connection.on(
        WebcastEvent.STREAM_END,
        () => {

            console.log(
                "TikTok LIVE ended"
            );


            broadcast({

                type: "status",

                connected: false,

                username

            });

        }
    );


    /* =====================
       خطأ
    ===================== */

    connection.on(
        "error",
        error => {

            console.error(
                "TikTok error:",
                error
            );


            broadcast({

                type: "error",

                message:
                    "TikTok connection error"

            });

        }
    );


    try {

        await connection.connect();


        console.log(
            "Connected to @" +
            username
        );


    } catch (error) {

        console.error(
            "Failed to connect:",
            error
        );


        tiktokConnection =
            null;

        currentUsername =
            null;


        broadcast({

            type: "error",

            message:
                "Unable to connect to TikTok LIVE"

        });

    }

}


/* =========================
   API الاتصال
========================= */

app.get(
    "/connect",
    async (req, res) => {

        try {

            const input =
                req.query.url ||
                req.query.username;


            if (!input) {

                return res
                    .status(400)
                    .json({

                        error:
                            "Add ?url=TikTokLIVE_URL"

                    });

            }


            await connectTikTok(
                input
            );


            res.json({

                ok: true,

                username:
                    getUsername(input)

            });


        } catch (error) {

            res
                .status(500)
                .json({

                    ok: false,

                    error:
                        error.message

                });

        }

    }
);


/* =========================
   تشغيل السيرفر
========================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log(
            "Server running on port " +
            PORT
        );

    }
);

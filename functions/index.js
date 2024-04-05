// The Cloud Functions for Firebase SDK to create Cloud Functions and triggers.
const {logger} = require("firebase-functions");
const {onRequest} = require("firebase-functions/v2/https");
const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const functions = require("firebase-functions");
const axios = require("axios");

// firebase-admin SDK
const OPENAI_API_KEY = functions.config().openai.api_key;
const MORI_MODEL_ID = functions.config().mori.model_id;
const MORI_SYSTEM_CONTENT = functions.config().mori.system_content;
const OPENAI_API_KEY2 = functions.config().openai.api_key2;
const DALLE_SYSTEM_CONTENT = functions.config().openai.system_conten;

// Firebase Admin SDK
// const admin = require("firebase-admin");
// const cors = require("cors")({origin: true});
// const busboy = require("busboy");
// const path = require("path");
// const os = require("os");
// const fs = require("fs");

// The Firebase Admin SDK to access Firestore.
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");

initializeApp();

// Take the text parameter passed to this HTTP endpoint and insert it into
// Firestore under the path /messages/:documentId/original
exports.addmessage = onRequest(async (req, res) => {
  // Grab the text parameter.
  const original = req.query.text;
  // Push the new message into Firestore using the Firebase Admin SDK.
  const writeResult = await getFirestore()
      .collection("messages")
      .add({original: original});
  // Send back a message that we've successfully written the message
  res.json({result: `Message with ID: ${writeResult.id} added.`});
});

// Listens for new messages added to /messages/:documentId/original
// and saves an uppercased version of the message
// to /messages/:documentId/uppercase
exports.makeuppercase = onDocumentCreated("/messages/{documentId}", (event) => {
  // Grab the current value of what was written to Firestore.
  const original = event.data.data().original;

  // Access the parameter `{documentId}` with `event.params`
  logger.log("Uppercasing", event.params.documentId, original);

  const uppercase = original.toUpperCase();

  // You must return a Promise when performing
  // asynchronous tasks inside a function
  // such as writing to Firestore.
  // Setting an 'uppercase' field in Firestore document returns a Promise.
  return event.data.ref.set({uppercase}, {merge: true});
});

/**
 * Test API function.
 */
exports.test = functions
    .region("us-central1")
    .https.onRequest((request, response) => {
      response.send("Hello World!");
    });

/**
 * Calls the ChatGPT MORI API and returns the response.
 */
exports.chatMORI = functions.https.onRequest(async (request, response) => {
  const {message} = request.body; // 클라이언트로부터 받은 메시지

  if (!message) {
    response.status(400).send("Message is required");
    return;
  }

  try {
    const openAIResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: MORI_MODEL_ID,
          messages: [
            {role: "system", content: MORI_SYSTEM_CONTENT},
            {role: "user", content: message},
          ],
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        },
    );

    // API 응답에서 content만 추출하여 클라이언트에게 반환합니다.
    const content = openAIResponse.data.choices[0].message.content;
    response.send({content});
  } catch (error) {
    console.error("Error calling OpenAI:", error.response.data);
    response.status(500).send("Error processing your request.");
  }
});

/**
 * Calls the ChatGPT API and stores the response in Realtimebase. (For TEST)
 */
exports.addMemCard = functions.https.onRequest(async (request, response) => {
  const messages = request.body.messages;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return response
        .status(400)
        .send("Messages are required and must be an array.");
  }

  // ChatGPT API를 사용하여 메시지 리스트 요약
  try {
    // messages 배열을 ChatGPT API 요청 포맷에 맞게 구성
    const messagesFormatted = [
      {
        role: "system",
        content:
          "사용자가 보내는 대화 내용을 -에요, -이에요 체로 무조건 한 줄 요약해주는 모델",
      },
      ...messages.map((message) => ({
        role: "user",
        content: message,
      })),
    ];

    const openAIResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: messagesFormatted,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY2}`,
            "Content-Type": "application/json",
          },
        },
    );

    const summary = openAIResponse.data.choices[0].message.content;
    const imgUrl =
      "https://firebasestorage.googleapis.com/v0/b/memori-7aab6.appspot.com/o/Maskbig.png?alt=media&token=24036737-d545-4b7c-b134-88ee688364af";

    // Firebase Realtime Database에 결과 저장을 위한 외부 API 요청
    const firebaseResponse = await axios.post(
        "https://memori-7aab6-default-rtdb.firebaseio.com/memCard.json",
        {
          imgUrl: imgUrl,
          summary: summary,
        },
    );

    if (firebaseResponse.status === 200) {
      response.json({
        imgUrl: imgUrl,
        summary: summary,
      });
    } else {
      response.status(500).send("Error processing that sotores in database.");
    }
  } catch (error) {
    console.error("Error calling OpenAI or saving to database:", error);
    response.status(500).send("Error processing your request.");
  }
});

// /**
//  *
//  */
// exports.uploadImage = functions.https.onRequest((req, res) => {
//   cors(req, res, () => {
//     // Busboy 인스턴스 생성 방식 변경
//     const bb = busboy({headers: req.headers});
//     let uploadData = null;
//     let filePath;

//     bb.on("file", (fieldname, file, filename, encoding, mimetype) => {
//       if (fieldname === "image") {
//         // 파일 이름과 임시 디렉토리 경로 생성
//         filePath = path.join(os.tmpdir(), filename);
//         uploadData = {filePath, type: mimetype, fileName: filename};

//         // 파일을 임시 디렉토리에 저장
//         file.pipe(fs.createWriteStream(filePath));
//       } else {
//         console.log("Unexpected field: ", fieldname);
//         return res.status(400).send("Unexpected field.");
//       }
//     });

//     bb.on("finish", () => {
//       if (!uploadData) {
//         return res.status(400).send("File upload failed.");
//       }

//       const bucket = admin.storage().bucket();
//       bucket
//           .upload(uploadData.filePath, {
//             uploadType: "media",
//             metadata: {
//               metadata: {
//                 contentType: uploadData.type,
//               },
//             },
//           })
//           .then(() =>
//             bucket.file(uploadData.fileName).getSignedUrl({
//               action: "read",
//               expires: "03-09-2491",
//             }),
//           )
//           .then((signedUrls) => {
//             res.status(200).json({imageUrl: signedUrls[0]});
//           })
//           .catch((err) => {
//             console.error(err);
//             res.status(500).json({error: err.toString()});
//           });
//     });

//     req.pipe(bb);
//   });
// });

// /**
//  * Calls the ChatGPT API for summarization and returns the response.
//  */
// exports.summarize = functions.https.onRequest(async (request, response) => {
//   const messages = request.body.messages;

//   if (!messages || !Array.isArray(messages) || messages.length === 0) {
//     return response
//         .status(400)
//         .send("Messages are required and must be an array.");
//   }

//   // ChatGPT API를 사용하여 메시지 리스트 요약
//   try {
//     // messages 배열을 ChatGPT API 요청 포맷에 맞게 구성
//     const messagesFormatted = [
//       {
//         role: "system",
//         content:
//           "사용자가 보내는 대화 내용을 -에요, -이에요 체로 무조건 한 줄 요약해주는 모델",
//       },
//       ...messages.map((message) => ({
//         role: "user",
//         content: message,
//       })),
//     ];

//     const openAIResponse = await axios.post(
//         "https://api.openai.com/v1/chat/completions",
//         {
//           model: "gpt-3.5-turbo",
//           messages: messagesFormatted,
//         },
//         {
//           headers: {
//             "Authorization": `Bearer ${OPENAI_API_KEY2}`,
//             "Content-Type": "application/json",
//           },
//         },
//     );

//     const summary = openAIResponse.data.choices[0].message.content;
//     const imgUrl =
//       "https://firebasestorage.googleapis.com/v0/b/memori-7aab6.appspot.com/o/Mask%20group.png?alt=media&token=2b99f195-79b3-45cd-96b3-bd29956ca7d2";

//     // 응답 객체에 이미지 링크와 요약 내용 포함
//     response.send({
//       imgUrl: imgUrl,
//       summary: summary,
//     });
//   } catch (error) {
//     console.error("Error calling OpenAI or saving to database:", error);
//     response.status(500).send("Error processing your request.");
//   }
// });

/**
 * Calls the ChatGPT API(DALL-E) and stores the response in Realtimebase.
 */
exports.addMemoryCard = functions.https.onRequest(async (request, response) => {
  const messages = request.body.messages;
  const title = request.body.title;

  if (
    !messages ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !title
  ) {
    return response
        .status(400)
        .send("Messages are required and must be an array.");
  }

  // ChatGPT API를 사용하여 메시지 리스트 요약
  try {
    // messages 배열을 ChatGPT API 요청 포맷에 맞게 구성
    const messagesFormatted = [
      {
        role: "system",
        content:
          "사용자가 보내는 대화 내용을 -에요, -이에요 체로 무조건 한 줄 요약해주는 모델",
      },
      ...messages.map((message) => ({
        role: "user",
        content: message,
      })),
    ];

    const openAIResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: messagesFormatted,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY2}`,
            "Content-Type": "application/json",
          },
        },
    );

    const summary = openAIResponse.data.choices[0].message.content;
    // summary를 영어로 번역

    // DALL-E API를 사용하여 이미지 생성

    const imgUrl =
      "https://firebasestorage.googleapis.com/v0/b/memori-7aab6.appspot.com/o/happy.png?alt=media&token=6e637ef0-b646-489f-8ae2-b450b9aa32fc";

    // Firebase Realtime Database에 결과 저장을 위한 외부 API 요청
    const firebaseResponse = await axios.post(
        "https://memori-7aab6-default-rtdb.firebaseio.com/memoryCard.json",
        {
          imgUrl: imgUrl,
          summary: summary,
          title: title,
        },
    );

    if (firebaseResponse.status === 200) {
      response.json({
        imgUrl: imgUrl,
        summary: summary,
        title: title,
      });
    } else {
      response.status(500).send("Error processing that sotores in database.");
    }
  } catch (error) {
    console.error("Error calling OpenAI or saving to database:", error);
    response.status(500).send("Error processing your request.");
  }
});

/**
 * Calls the ChatGPT API(DALL-E) and stores the response in Realtimebase.
 */
exports.addMemorytest = functions.https.onRequest(async (request, response) => {
  const messages = request.body.messages;
  const title = request.body.title;

  if (
    !messages ||
    !Array.isArray(messages) ||
    messages.length === 0 ||
    !title
  ) {
    return response
        .status(400)
        .send("Messages are required and must be an array.");
  }

  // ChatGPT API를 사용하여 메시지 리스트 요약 -> 영어로 번역 -> DALL-E API를 사용하여 이미지 생성
  try {
    // messages 배열을 ChatGPT API 요청 포맷에 맞게 구성
    const messagesFormatted = [
      {
        role: "system",
        content:
          "사용자가 보내는 대화 내용을 -에요, -이에요 체로 무조건 한 줄 요약해주는 모델",
      },
      ...messages.map((message) => ({
        role: "user",
        content: message,
      })),
    ];

    const openAIResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: messagesFormatted,
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY2}`,
            "Content-Type": "application/json",
          },
        },
    );
    const summary = openAIResponse.data.choices[0].message.content;

    // summary를 영어로 번역
    const openAIResponse2 = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content:
              "사용자가 보내는 요약에 관련된 이미지 생성할 때 사용하는 프롬프트를 작성해주는 모델",
            },
            {role: "user", content: summary},
          ],
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY2}`,
            "Content-Type": "application/json",
          },
        },
    );
    const sumPrompt = openAIResponse2.data.choices[0].message.content;

    // DALL-E API를 사용하여 이미지 생성
    const DALLEresponse = await axios.post(
        "https://api.openai.com/v1/images/generations",
        {
          prompt: `${sumPrompt}, ${DALLE_SYSTEM_CONTENT}`,
          n: 1,
          size: "1024x1024",
        },
        {
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY2}`,
            "Content-Type": "application/json",
          },
        },
    );
    const imgUrl = DALLEresponse.data.data[0].url;

    // if (!imgUrl) {
    //   imgUrl =
    //     "https://firebasestorage.googleapis.com/v0/b/memori-7aab6.appspot.com/o/Maskbig.png?alt=media&token=24036737-d545-4b7c-b134-88ee688364af";
    // }

    // const imgUrl =
    //   "https://firebasestorage.googleapis.com/v0/b/memori-7aab6.appspot.com/o/Maskbig.png?alt=media&token=24036737-d545-4b7c-b134-88ee688364af";

    // Firebase Realtime Database에 결과 저장을 위한 외부 API 요청
    const firebaseResponse = await axios.post(
        "https://memori-7aab6-default-rtdb.firebaseio.com/memoryCard.json",
        {
          imgUrl: imgUrl,
          summary: summary,
          title: title,
        },
    );

    if (firebaseResponse.status === 200) {
      response.json({
        imgUrl: imgUrl,
        summary: summary,
        title: title,
      });
    } else {
      response.status(500).send("Error processing that sotores in database.");
    }
  } catch (error) {
    console.error("Error calling OpenAI or saving to database:", error);
    response.status(500).send("Error processing your request.");
  }
});

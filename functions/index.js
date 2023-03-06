const functions = require('firebase-functions')
const admin = require('firebase-admin')
admin.initializeApp()

// Sends a new Boujee notification to the recipient. The notification content and title are different 
// based on whether the author made a new Boujee, a Boujee back or a chain Boujee. 
exports.sendPostNotificationToRecipient = functions.firestore
  .document('Posts/{postId}')
  .onCreate(async (snapshot, context) => {
    const postData = snapshot.data();
    const recipientId = postData.recipientID;

    const db = admin.firestore();

    try {
      // Fetch the FCM token for the recipient user from the "FCMTokens" collection
      const fcmTokenSnapshot = await db.collection('FCMTokens').doc(recipientId).get();
      if (!fcmTokenSnapshot.exists) {
        console.error(`FCM token not found for user with ID ${recipientId}`);
        return null;
      }

      const fcmToken = fcmTokenSnapshot.data().token;

      // Create a custom notification payload based on the boujee type.
      var notificationBody = ""
      var notificationTitle = "" 
      if (postData.isParent == true) {
        // The author has made a new boujee for their recipient. 
        notificationTitle = 'Boujee for you!'
        notificationBody = `${postData.authorUsername} just boujee'd you! Boujee them back!`
      } else if (postData.isPaired == true) { 
        // The author has boujeed back because the recipient had previously boujee'd them. 
        notificationTitle = 'Your friend Boujee\'d Back!'
        notificationBody = `${postData.authorUsername} just boujee'd you back! Check out what they posted.`
      } else {
        // else post is neither a parent nor paired, so must be a chain post. 
        notificationTitle = 'Your friend chained a Boujee!'
        notificationBody = `${postData.authorUsername} just chained a boujee to yours! Check it out!`
      }

      // Create the custom payload. 
      const notificationPayload = {
        notification: {
          title: notificationTitle, 
          body: notificationBody 
        },
        data: {
          postId: context.params.postId
        }
      };

      // Send the notification to the recipient user's FCM token
      await admin.messaging().sendToDevice(fcmToken, notificationPayload);
      console.log(`Custom notification sent to user with ID ${recipientId}`);
    } catch (error) {
      console.error(`Error sending custom notification to user with ID ${recipientId}:`, error);
    }
    return null;
  });


// This function triggers when a userProfileImageURL updates for a user in the Users Collection
// –indicating a change in the user's profile picture– and then updates all user profile docs 
// present in the any other collections/subcollections in our firestore database. Currently,
// there's copies of the user profile doc in 
// 1) Posts/chainUserProfiles
exports.updateUserProfileImageURL = functions.firestore
  .document('Users/{userId}')
  .onUpdate(async (change, context) => {
    const previousData = change.before.data();
    const newData = change.after.data();

    // Check if the userProfileImageURL field was updated
    if (previousData.userProfileImageURL === newData.userProfileImageURL) {
      return null;
    }

    const userId = context.params.userId;

    // Update user documents in Posts/chainUserProfiles subcollections
    const chainUserProfilesSnapshot = await admin.firestore().collectionGroup('chainUserProfiles').where('firestoreID', '==', userId).get()
    const followerQuerySnapshot = await admin.firestore().collectionGroup('Followers').where('firestoreID', '==', userId).get()
    const followingQuerySnapshot = await admin.firestore().collectionGroup('Following').where('firestoreID', '==', userId).get()
    const batch = admin.firestore().batch()

    chainUserProfilesSnapshot.forEach((doc) => {
      batch.update(doc.ref, { userProfileImageURL: newData.userProfileImageURL })
    })
    followerQuerySnapshot.forEach((doc) => {
      batch.update(doc.ref, { userProfileImageURL: newData.userProfileImageURL })
    })
    followingQuerySnapshot.forEach((doc) => {
      batch.update(doc.ref, { userProfileImageURL: newData.userProfileImageURL })
    })
    return batch.commit();
  });


exports.sendFollowerNotification = functions.firestore
  .document('/Users/{userID}/Followers/{followerID}')
  .onCreate((change, context) => {
    // Get the userID from the context
    const userID = context.params.userID
    // Get the followerID from the context
    const followerID = context.params.followerID
    // Get the follower document
    return admin.firestore().collection('Users').doc(followerID).get()
      .then(snapshot => {
        const firstName = snapshot.get('firstName')
        const lastName = snapshot.get('lastName')
        const followerName = `${firstName} ${lastName}`
        console.log(`New follower added: ${followerName}(${followerID}) for user: ${userID}`)
        // Get the FCM token for the user
        return admin.firestore().collection('FCMTokens').doc(userID).get()
        .then(snapshot => {
          const fcmToken = snapshot.get('token');
          // Create the payload to send to the device
          const payload = {
            notification: {
              title: 'New Follower',
              body: `You have a new follower: ${followerName}`,
              badge: '1',
              sound: 'default'
            }
          }
          console.log(`Sending notification to: ${fcmToken}`)
          // Send the notification to the device
          return admin.messaging().sendToDevice(fcmToken, payload)
          .then(response => {
              console.log("Notification sent successfully:", response)
          })
          .catch(error => {
              console.log("Error sending notification:", error)
          })
        })
      })
  })

exports.sendReviewNotification = functions.firestore
  .document('/Reviews/{reviewId}')
  .onCreate((snapshot, context) => {
    // Get the userID from the review document
    const userID = snapshot.get('uid')
    // Get the FCM token for the user
    return admin.firestore().collection('FCMTokens').doc(userID).get()
      .then(snapshot => {
        const fcmToken = snapshot.get('token')
        // Create the payload to send to the device
        const payload = {
          notification: {
            title: 'New Boujee',
            body: `You have a new Boujee`,
            badge: '1',
            sound: 'default'
          }
        }
        console.log(`Sending notification to: ${fcmToken}`)
        // Send the notification to the device
        return admin.messaging().sendToDevice(fcmToken, payload)
        .then(response => {
            console.log("Notification sent successfully:", response)
        })
        .catch(error => {
            console.log("Error sending notification:", error)
        })
      })
  })

exports.sendCommentNotification = functions.firestore
  .document('/Comments/{commentId}')
  .onCreate((snapshot, context) => {
    const reviewID = snapshot.get('reviewID');
    const userName = snapshot.get('authorUserName')
    // Get the review document
    return admin.firestore().collection('Reviews').doc(reviewID).get()
    .then(reviewSnapshot => {
        // Get the userID from the review document
        const userID = reviewSnapshot.get('uid');
        // Get the FCM token for the user
        return admin.firestore().collection('FCMTokens').doc(userID).get()
        .then(fcmSnapshot => {
            const fcmToken = fcmSnapshot.get('token')
            // Create the payload to send to the device
            const payload = {
                notification: {
                    title: 'New Comment',
                    body: `${userName} commented on your post`,
                    badge: '1',
                    sound: 'default'
                }
            }
            console.log(`Sending notification to: ${fcmToken}`)
            // Send the notification to the device
            return admin.messaging().sendToDevice(fcmToken, payload)
            .then(response => {
                console.log("Notification sent successfully:", response)
            })
            .catch(error => {
                console.log("Error sending notification:", error)
            })
        })
    })
  })

exports.sendLivePostNotification = functions.firestore
  .document('/LiveBoujees/{postId}')
  .onCreate((snapshot, context) => {
    // careful with the field name. It's case sensitive.
    const anon = snapshot.get('anonymous')
    var userName = 'Someone'
    if (anon == false) { userName = snapshot.get('authorUsername') }
    // Get the review document
   
    // Get the userID from the review document
    const userID = snapshot.get('userID');
    // Get the FCM token for the user
    return admin.firestore().collection('FCMTokens').doc(userID).get()
    .then(fcmSnapshot => {
        const fcmToken = fcmSnapshot.get('token')
        // Create the payload to send to the device
        const payload = {
            notification: {
                title: `Billboard Boujee `,
                body: `${userName} boujee'd you on your billboard!`,
                badge: '1',
                sound: 'default'
            }
        }
        console.log(`Sending notification to: ${fcmToken}`)
        // Send the notification to the device
        return admin.messaging().sendToDevice(fcmToken, payload)
        .then(response => {
            console.log("Notification sent successfully:", response)
        })
        .catch(error => {
            console.log("Error sending notification:", error)
        })
    })
  })

// // this cloud function uses the batch write operation to do a batch 
// // write update for all users to add the userProfileImageUrl.
// exports.updateUserProfiles = functions.firestore
//   .document('batchUpdateTrigger/{docId}')
//   .onCreate((snap, context) => {
//     const batch = admin.firestore().batch();
//     const usersRef = admin.firestore().collection('Users')

//     return usersRef.get()
//       .then(snapshot => {
//         snapshot.forEach(doc => {
//           const userRef = usersRef.doc(doc.id);
//           batch.update(userRef, { 
//             userProfileImageURL: 'https://firebasestorage.googleapis.com/v0/b/fir-eris.appspot.com/o/TestImages%2Fjeremy-bishop-rqWoB4LFgmc-unsplash.jpg?alt=media&token=9daeb7d0-391a-4ec6-b67c-ad35c85a4348' 
//           })
//         })

//         return batch.commit()
//       })
//       .catch(err => {
//         console.log('Error updating user profiles:', err)
//         // throw err
//       })
//   })
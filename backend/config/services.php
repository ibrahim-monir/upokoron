<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    /*
     * WhatsApp Business Cloud API -- the shop's support inbox.
     *
     * All five come from the Meta app, and none of them belong in the
     * settings table: a token that can send messages as the business is a
     * credential, and credentials live where the database backup does not.
     *
     * The number must be one registered to the Cloud API and NOT signed in
     * on anybody's phone -- WhatsApp allows a number to be one or the other,
     * never both, and registering it to the API logs the app out for good.
     */
    'whatsapp' => [
        'phone_number_id' => env('WHATSAPP_PHONE_NUMBER_ID'),
        'token' => env('WHATSAPP_TOKEN'),

        // Echoed back to Meta when it verifies the webhook URL. Any string,
        // as long as it matches what is typed into the app dashboard.
        'verify_token' => env('WHATSAPP_VERIFY_TOKEN'),

        // Signs every incoming webhook. Without it anyone who learns the URL
        // can post invented customer messages into the inbox.
        'app_secret' => env('WHATSAPP_APP_SECRET'),

        'api_version' => env('WHATSAPP_API_VERSION', 'v21.0'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];

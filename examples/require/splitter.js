export const activate = (vmfs, ec) => {
vmfs.write(
  "/examples/require/splitter.rbj",
  Buffer.from(`
    [
  "YARVInstructionSequence/SimpleDataFormat",
  3,
  0,
  1,
  {
    "arg_size": 0,
    "local_size": 0,
    "stack_max": 3,
    "node_id": 13,
    "code_location": [
      1,
      0,
      3,
      39
    ]
  },
  "<compiled>",
  "<compiled>",
  "<compiled>",
  1,
  "top",
  [

  ],
  {
  },
  [

  ],
  [
    1,
    "RUBY_EVENT_LINE",
    [
      "putself"
    ],
    [
      "putstring",
      "examples/require/utils"
    ],
    [
      "opt_send_without_block",
      {
        "mid": "require",
        "flag": 20,
        "orig_argc": 1
      }
    ],
    [
      "pop"
    ],
    3,
    "RUBY_EVENT_LINE",
    [
      "putself"
    ],
    [
      "opt_getinlinecache",
      "label_16",
      0
    ],
    [
      "putobject",
      {
        "value": true,
        "type": "TrueClass"
      }
    ],
    [
      "getconstant",
      "Utils"
    ],
    [
      "opt_setinlinecache",
      0
    ],
    "label_16",
    [
      "opt_send_without_block",
      {
        "mid": "new",
        "flag": 16,
        "orig_argc": 0
      }
    ],
    [
      "putstring",
      "foo bar"
    ],
    [
      "opt_send_without_block",
      {
        "mid": "split",
        "flag": 16,
        "orig_argc": 1
      }
    ],
    [
      "opt_send_without_block",
      {
        "mid": "inspect",
        "flag": 16,
        "orig_argc": 0
      }
    ],
    [
      "opt_send_without_block",
      {
        "mid": "puts",
        "flag": 20,
        "orig_argc": 1
      }
    ],
    [
      "leave"
    ]
  ]
]
  `, "utf8")
);
vmfs.write(
  "/examples/require/utils.rbj",
  Buffer.from(`
    [
  "YARVInstructionSequence/SimpleDataFormat",
  3,
  0,
  1,
  {
    "arg_size": 0,
    "local_size": 0,
    "stack_max": 1,
    "node_id": 11,
    "code_location": [
      1,
      0,
      5,
      3
    ]
  },
  "<class:Utils>",
  "<compiled>",
  "<compiled>",
  1,
  "class",
  [

  ],
  {
  },
  [

  ],
  [
    1,
    "RUBY_EVENT_LINE",
    [
      "putspecialobject",
      3
    ],
    [
      "putnil"
    ],
    [
      "defineclass",
      "Utils",
      [
        "YARVInstructionSequence/SimpleDataFormat",
        3,
        0,
        1,
        {
          "arg_size": 1,
          "local_size": 1,
          "stack_max": 1,
          "node_id": 8,
          "code_location": [
            2,
            2,
            4,
            5
          ]
        },
        "split",
        "<compiled>",
        "<compiled>",
        2,
        "method",
        [
          "str"
        ],
        {
          "lead_num": 1
        },
        [

        ],
        [
          2,
          "RUBY_EVENT_LINE",
          "RUBY_EVENT_CLASS",
          [
            "definemethod",
            "split",
            [
              "YARVInstructionSequence/SimpleDataFormat",
              3,
              0,
              1,
              {
                "arg_size": 1,
                "local_size": 1,
                "stack_max": 1,
                "node_id": 8,
                "code_location": [
                  2,
                  2,
                  4,
                  5
                ]
              },
              "split",
              "<compiled>",
              "<compiled>",
              2,
              "method",
              [
                "str"
              ],
              {
                "lead_num": 1
              },
              [

              ],
              [
                3,
                "RUBY_EVENT_LINE",
                "RUBY_EVENT_CALL",
                [
                  "getlocal_WC_0",
                  3
                ],
                [
                  "opt_send_without_block",
                  {
                    "mid": "split",
                    "flag": 16,
                    "orig_argc": 0
                  }
                ],
                4,
                "RUBY_EVENT_RETURN",
                [
                  "leave"
                ]
              ]
            ]
          ],
          [
            "putobject",
            {
              "value": "split",
              "type": "Symbol"
            }
          ],
          5,
          "RUBY_EVENT_END",
          [
            "leave"
          ]
        ]
      ],
      0
    ],
    [
      "leave"
    ]
  ]
]
  `, "utf8")
);
ec.push_onto_load_path("examples/");
};

#! /bin/bash

rails _7.1.2_ new demo \
    --name Demo \
    --skip-active-record \
    --skip-action-mailer \
    --skip-action-mailbox \
    --skip-action-text \
    --skip-active-job \
    --skip-active-storage \
    --asset-pipeline=propshaft \
    --skip-jbuilder \
    --javascript=esbuild
